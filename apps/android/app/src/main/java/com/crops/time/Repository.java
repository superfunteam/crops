package com.crops.time;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** A single request queue prevents timer races between the screen and notification. */
public final class Repository {
    public static final String DEFAULT_SERVER = "https://crops.wims.vc";
    // Kept only to migrate the exact previous production origin on upgrade.
    static final String LEGACY_PRODUCTION_SERVER = "https://crops-superfun.netlify.app";
    public interface Listener { void changed(); }
    interface Completion { void done(boolean success); }
    private final SharedPreferences prefs;
    private final SecureSession session;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final List<Listener> listeners = new ArrayList<>();
    private volatile String token;
    public volatile JSONObject state;
    public volatile boolean busy, refreshing;
    public volatile String error = "";
    public volatile long lastSyncedAt, serverOffset;
    private volatile long serverAtSync, elapsedAtSync;
    private String stateEtag = "", statePath = "";

    Repository(Context context) {
        prefs = context.getSharedPreferences("crops", Context.MODE_PRIVATE);
        session = new SecureSession(context);
        if (LEGACY_PRODUCTION_SERVER.equals(prefs.getString("server", null))) {
            // Never forward a stored bearer token to a changed origin. The user
            // signs in again; custom and local server configurations are untouched.
            session.clear();
            prefs.edit().putString("server", DEFAULT_SERVER).remove("teamId").remove("state").putBoolean("persistentSync", false).apply();
        }
        token = session.read();
        if (signedIn()) try { state = new JSONObject(prefs.getString("state", "{}")); if (!state.has("user")) state = null; } catch (Exception ignored) { state = null; }
    }
    public String server() { return prefs.getString("server", DEFAULT_SERVER); }
    public String teamId() { return prefs.getString("teamId", ""); }
    public boolean signedIn() { return token != null && !token.isEmpty(); }
    public boolean persistentSync() { return prefs.getBoolean("persistentSync", false); }
    public void persistentSync(boolean enabled) { prefs.edit().putBoolean("persistentSync", enabled).apply(); }
    public void addListener(Listener listener) { if (!listeners.contains(listener)) listeners.add(listener); }
    public void removeListener(Listener listener) { listeners.remove(listener); }
    private void publish() { main.post(() -> { for (Listener listener : new ArrayList<>(listeners)) listener.changed(); }); }
    private static JSONObject object(Object... pairs) {
        JSONObject json = new JSONObject();
        try { for (int i = 0; i < pairs.length; i += 2) json.put((String) pairs[i], pairs[i+1]); } catch (Exception error) { throw new IllegalArgumentException(error); }
        return json;
    }
    static String normalizeServer(String value) throws Exception {
        String base = value.trim().replaceAll("/+$", "");
        URI uri = new URI(base);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null)
            throw new Exception("Enter a valid server URL, such as https://crops.yourcompany.com.");
        return base;
    }
    public void login(String base, String username, String password, String name, String team, Completion completion) {
        if (busy) return;
        try { base = normalizeServer(base); } catch (Exception exception) { error = exception.getMessage(); publish(); completion.done(false); return; }
        final String server = base;
        busy = true; error = ""; publish();
        network.execute(() -> {
            boolean success = false;
            try {
                JSONObject body = object("username", username.trim(), "password", password);
                boolean register = name != null;
                if (register) { body.put("name", name.trim()); body.put("teamName", team.trim()); }
                JSONObject response = request(server, register ? "/api/auth/register" : "/api/auth/login", "POST", body, "");
                String nextToken = response.getString("token");
                session.save(nextToken); token = nextToken;
                prefs.edit().putString("server", server).remove("teamId").remove("state").apply(); state = null;
                fetchState(); success = true;
            } catch (Exception exception) { error = message(exception); }
            boolean result = success; busy = false; publish(); main.post(() -> completion.done(result));
        });
    }
    public void selectTeam(String id) {
        if (busy || id.equals(teamId())) return;
        prefs.edit().putString("teamId", id).apply(); refresh();
    }
    public synchronized void refresh() {
        if (!signedIn() || refreshing || busy) return;
        refreshing = true;
        network.execute(() -> {
            try { fetchState(); error = ""; } catch (Exception exception) { handleError(exception); }
            refreshing = false; publish();
        });
    }
    private void fetchState() throws Exception {
        String team = teamId();
        JSONObject next = request(server(), "/api/state" + (team.isEmpty() ? "" : "?teamId=" + URLEncoder.encode(team, "UTF-8")), "GET", null, token);
        long now = System.currentTimeMillis();
        try { serverAtSync = Instant.parse(next.getString("serverTime")).toEpochMilli(); } catch (Exception ignored) { serverAtSync = now; }
        elapsedAtSync = SystemClock.elapsedRealtime(); serverOffset = serverAtSync - now;
        state = next; lastSyncedAt = now;
        JSONObject teamObject = next.optJSONObject("team");
        SharedPreferences.Editor edit = prefs.edit().putString("state", next.toString());
        if (teamObject != null) edit.putString("teamId", teamObject.optString("id"));
        edit.apply();
    }
    public void start(String projectId, String task, String notes, boolean billable, String entryId) {
        JSONObject body = object("teamId", teamId(), "projectId", projectId, "task", task.trim(), "notes", notes.trim(), "billable", billable, "date", java.time.LocalDate.now().toString());
        if (entryId != null) try { body.put("entryId", entryId); } catch (Exception ignored) {}
        mutate("/api/timer/start", body);
    }
    public void stop(String entryId, int displayedVersion) { mutate("/api/timer/stop", object("entryId", entryId, "version", displayedVersion)); }
    public void manual(String projectId, String task, String notes, String date, long seconds, boolean billable) {
        mutate("/api/entries", object("teamId", teamId(), "projectId", projectId, "task", task.trim(), "notes", notes.trim(), "date", date, "durationSeconds", seconds, "billable", billable));
    }
    private synchronized void mutate(String path, JSONObject body) {
        if (busy || !signedIn()) return;
        busy = true; error = ""; publish();
        final String requestId = java.util.UUID.randomUUID().toString();
        network.execute(() -> {
            boolean saved = false;
            try { request(server(), path, "POST", body, token, requestId); saved = true; fetchState(); }
            catch (Exception exception) {
                handleError(exception);
                if (saved) error = "Saved. Waiting to confirm the latest timer: " + error;
                else if (!(exception instanceof ApiException)) error = "Connection interrupted. Sync before trying again; your change may have reached the server.";
                // Read after ambiguous outcomes; never retry a timer mutation automatically.
                if (signedIn()) try { fetchState(); } catch (Exception ignored) {}
            }
            busy = false; publish();
        });
    }
    public void logout() {
        if (busy) return;
        final String oldToken = token; final String base = server();
        token = ""; session.clear(); state = null; error = ""; lastSyncedAt = 0;
        prefs.edit().remove("state").remove("teamId").putBoolean("persistentSync", false).apply(); publish();
        network.execute(() -> { try { request(base, "/api/auth/logout", "POST", object(), oldToken); } catch (Exception ignored) {} });
    }
    private void handleError(Exception exception) {
        error = message(exception);
        if (exception instanceof ApiException && ((ApiException) exception).status == 401) {
            token = ""; session.clear(); state = null; prefs.edit().remove("state").apply(); error = "Your session expired. Please sign in again.";
        }
    }
    private static String message(Exception exception) { return exception.getMessage() == null ? "Could not connect. Check your server and network." : exception.getMessage(); }
    private JSONObject request(String base, String path, String method, JSONObject body, String auth) throws Exception {
        return request(base, path, method, body, auth, "");
    }
    private JSONObject request(String base, String path, String method, JSONObject body, String auth, String requestId) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(base + path).openConnection();
        try {
            connection.setRequestMethod(method); connection.setConnectTimeout(12000); connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false); connection.setRequestProperty("Accept", "application/json");
            if (auth != null && !auth.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + auth);
            if (!requestId.isEmpty()) connection.setRequestProperty("Idempotency-Key", requestId);
            boolean stateRequest = "GET".equals(method) && path.startsWith("/api/state");
            if (stateRequest && state != null && path.equals(statePath) && !stateEtag.isEmpty()) connection.setRequestProperty("If-None-Match", stateEtag);
            if (body != null) {
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream stream = connection.getOutputStream()) { stream.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status == 304 && stateRequest && state != null) {
                JSONObject unchanged = new JSONObject(state.toString());
                String time = connection.getHeaderField("X-Crops-Server-Time");
                if (time != null && !time.isEmpty()) unchanged.put("serverTime", time);
                else {
                    // A hosting proxy may synthesize 304 and omit custom headers.
                    // Its standard Date still advances. If neither exists, keep
                    // advancing our monotonic estimate instead of reusing an old timestamp.
                    long responseTime = connection.getHeaderFieldDate("Date", -1);
                    unchanged.put("serverTime", Instant.ofEpochMilli(responseTime > 0 ? responseTime : currentServerMillis()).toString());
                }
                return unchanged;
            }
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = "";
            if (stream != null) try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] bytes = new byte[8192]; int count;
                while ((count = input.read(bytes)) != -1) { output.write(bytes, 0, count); if (output.size() > 10_000_000) throw new Exception("Server response is too large."); }
                text = output.toString("UTF-8");
            }
            JSONObject json;
            try { json = text.isEmpty() ? new JSONObject() : new JSONObject(text); }
            catch (Exception invalid) { throw new ApiException(status, "Server did not return Crops data. Check the server URL."); }
            if (status < 200 || status >= 300) {
                Object detail = json.opt("error");
                String reason = detail instanceof JSONObject ? ((JSONObject) detail).optString("message", "Request failed") : json.optString("error", json.optString("message", "Request failed (" + status + ")"));
                throw new ApiException(status, reason);
            }
            if (stateRequest) { statePath = path; stateEtag = connection.getHeaderField("ETag"); if (stateEtag == null) stateEtag = ""; }
            return json;
        } finally { connection.disconnect(); }
    }
    static class ApiException extends Exception { final int status; ApiException(int status, String message) { super(message); this.status = status; } }
    public JSONObject running() { return state == null ? null : state.optJSONObject("runningEntry"); }
    public JSONArray array(String name) { JSONArray array = state == null ? null : state.optJSONArray(name); return array == null ? new JSONArray() : array; }
    public JSONObject project(String id) {
        JSONArray projects = array("projects");
        for (int i = 0; i < projects.length(); i++) { JSONObject project = projects.optJSONObject(i); if (project != null && id.equals(project.optString("id"))) return project; }
        return null;
    }
    public String projectName(String id) { JSONObject project = project(id); return project == null ? "Project" : project.optString("name", "Project"); }
    public long duration(JSONObject entry) {
        long seconds = Math.max(0, entry.optLong("durationSeconds"));
        if (!entry.isNull("startedAt") && !entry.optString("startedAt").isEmpty()) try {
            long now = currentServerMillis();
            seconds += Math.max(0, (now - Instant.parse(entry.getString("startedAt")).toEpochMilli()) / 1000);
        } catch (Exception ignored) {}
        return seconds;
    }
    private long currentServerMillis() { return serverAtSync == 0 ? System.currentTimeMillis() : serverAtSync + SystemClock.elapsedRealtime() - elapsedAtSync; }
    public static String clock(long seconds) { return String.format(java.util.Locale.US, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60); }
}
