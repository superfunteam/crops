package com.crops.time;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

/** Device integration checks against an isolated, real Crops API. No test runtime dependencies. */
public final class CropsInstrumentation extends Instrumentation {
    private Bundle arguments;
    private int checks;
    private Repository repo;
    @Override public void onCreate(Bundle args) { super.onCreate(args); arguments = args == null ? new Bundle() : args; start(); }
    @Override public void onStart() {
        if ("true".equals(arguments.getString("originMigration"))) { new OriginMigrationSmoke(this).run(); return; }
        if ("true".equals(arguments.getString("hostedSmoke"))) { new HostedSmoke(this).run(); return; }
        Bundle result = new Bundle();
        try {
            waitForIdleSync();
            repo = CropsApp.repository;
            String server = arguments.getString("server", "http://10.0.2.2:8789");
            String username = "android_" + System.currentTimeMillis();
            String password = "Crops-test-only-2026";
            CountDownLatch login = new CountDownLatch(1);
            runOnMainSync(() -> repo.login(server, username, password, "Android Test", "Android Studio", okay -> login.countDown()));
            require(login.await(25, TimeUnit.SECONDS) && repo.signedIn() && repo.state != null, "Native registration and workspace load: " + repo.error);
            String projectId = repo.array("projects").getJSONObject(0).getString("id");
            String token = new SecureSession(getTargetContext()).read();
            require(!token.isEmpty() && new Repository(getTargetContext()).signedIn(), "Android Keystore session survives repository reload");
            String ciphertext = getTargetContext().getSharedPreferences("session", 0).getString("data", "");
            require(!ciphertext.isEmpty() && !ciphertext.contains(token), "Session is encrypted on disk");
            Activity activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            waitForIdleSync();
            runOnMainSync(() -> {
                Button start = findButton(activity.getWindow().getDecorView(), "Start timer");
                if (start == null) throw new AssertionError("Native Start timer button missing");
                start.performClick();
            });
            await(() -> !repo.busy && repo.running() != null, 20000, "Start timer through native button");
            String firstId = repo.running().getString("id");
            await(() -> TimerService.active, 5000, "Foreground timer service starts");
            NotificationManager manager = getTargetContext().getSystemService(NotificationManager.class);
            await(() -> manager.getActiveNotifications().length > 0, 5000, "Timer notification is visible");
            StatusBarNotification notification = manager.getActiveNotifications()[0];
            require(notification.getNotification().extras.getBoolean("android.showChronometer"), "Notification uses the native live chronometer");
            final Button[] displayedStop = { null };
            runOnMainSync(() -> displayedStop[0] = findButton(activity.getWindow().getDecorView(), "Stop timer"));
            require(displayedStop[0] != null, "Native Stop control is displayed");
            post(server + "/api/timer/stop", token, new JSONObject().put("entryId", firstId).put("version", repo.running().getInt("version")));
            JSONObject resumed = post(server + "/api/timer/start", token, new JSONObject().put("teamId", repo.teamId()).put("projectId", projectId).put("entryId", firstId));
            final int resumedVersion = resumed.getJSONObject("entry").getInt("version");
            runOnMainSync(() -> displayedStop[0].performClick());
            await(() -> !repo.busy && repo.running() != null && repo.running().optInt("version") == resumedVersion && repo.error.contains("changed"), 20000, "Stale native Stop cannot stop a remotely resumed entry");
            runOnMainSync(() -> repo.error = "");
            notification.getNotification().actions[0].actionIntent.send();
            await(() -> !repo.busy && repo.running() != null && repo.running().optInt("version") == resumedVersion && repo.error.contains("changed"), 20000, "Old notification retains its version and cannot stop a remotely resumed entry");
            waitForIdleSync();
            manager.getActiveNotifications()[0].getNotification().actions[0].actionIntent.send();
            await(() -> !repo.busy && repo.running() == null, 20000, "Notification Stop action persists on the server");
            runOnMainSync(() -> repo.manual(projectId, "Native verification", "Created by instrumentation", LocalDate.now().toString(), 5400, true));
            await(() -> !repo.busy && repo.array("entries").length() >= 2, 20000, "Manual entry persists");
            JSONObject manual = null;
            for (int i = 0; i < repo.array("entries").length(); i++) { JSONObject entry = repo.array("entries").getJSONObject(i); if (entry.getString("task").equals("Native verification")) manual = entry; }
            require(manual != null && manual.getLong("durationSeconds") == 5400, "Manual duration remains exactly 90 minutes");
            final String resumeId = manual.getString("id");
            editingChecks(activity, server, token, projectId, manual);
            runOnMainSync(() -> repo.start(projectId, "Native verification", "", true, resumeId));
            await(() -> !repo.busy && repo.running() != null && repo.running().optString("id").equals(resumeId), 20000, "Resume preserves the same time entry");
            require(repo.duration(repo.running()) >= 5400, "Resume includes accumulated duration");
            runningEditChecks(activity, resumeId);
            runOnMainSync(() -> {
                repo.persistentSync(true);
                getTargetContext().startForegroundService(new Intent(getTargetContext(), TimerService.class));
                repo.stop(resumeId, repo.running().optInt("version"));
            });
            await(() -> !repo.busy && repo.running() == null, 20000, "Stop before cross-device synchronization");
            await(() -> TimerService.active, 5000, "Idle cross-device service stays active");
            runOnMainSync(() -> activity.moveTaskToBack(true));
            JSONObject remote = post(server + "/api/timer/start", token, new JSONObject().put("teamId", repo.teamId()).put("projectId", projectId).put("task", "Cross-device timer").put("notes", "").put("billable", true).put("date", LocalDate.now().toString()));
            String remoteId = remote.getJSONObject("entry").getString("id");
            await(() -> repo.running() != null && repo.running().optString("id").equals(remoteId), 24000, "Background service discovers a remotely started timer");
            post(server + "/api/timer/stop", token, new JSONObject().put("entryId", remoteId));
            await(() -> repo.running() == null, 15000, "Remote Stop synchronizes back to Android");
            runOnMainSync(() -> { repo.persistentSync(false); getTargetContext().stopService(new Intent(getTargetContext(), TimerService.class)); repo.logout(); });
            require(!repo.signedIn() && new SecureSession(getTargetContext()).read().isEmpty(), "Logout clears secure credentials");
            CountDownLatch relogin = new CountDownLatch(1);
            runOnMainSync(() -> repo.login(server, username, password, null, null, okay -> relogin.countDown()));
            require(relogin.await(25000, TimeUnit.MILLISECONDS) && repo.signedIn() && repo.state != null, "Existing username/password sign-in succeeds");
            result.putString("stream", "\nOK (" + checks + " checks)\n"); finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "\nFAIL after " + checks + " checks: " + error + "\n" + android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }
    private JSONObject entry(String id) {
        org.json.JSONArray all = repo.array("entries");
        for (int i = 0; i < all.length(); i++) { JSONObject entry = all.optJSONObject(i); if (entry != null && id.equals(entry.optString("id"))) return entry; }
        return null;
    }
    private void editingChecks(Activity activity, String server, String token, String projectId, JSONObject manual) throws Exception {
        MainActivity main = (MainActivity) activity;
        final String id = manual.getString("id"); final int firstVersion = manual.getInt("version");
        // Agent label parsing is tolerant of missing, null, partial, and malformed usage.
        require(Repository.agentLabel(new JSONObject("{\"agent\":{\"tokens\":2410000,\"cost\":31.4,\"model\":\"claude-opus-5\"}}")).equals("2.41M tokens · $31.40")
            && Repository.agentLabel(new JSONObject("{\"agent\":null}")).isEmpty() && Repository.agentLabel(new JSONObject("{}")).isEmpty()
            && Repository.agentLabel(new JSONObject("{\"agent\":\"weird\"}")).isEmpty() && Repository.agentLabel(new JSONObject("{\"agent\":{\"tokens\":\"12\",\"cost\":2}}")).equals("$2.00")
            && Repository.agentLabel(new JSONObject("{\"agent\":{\"tokens\":999999}}")).equals("1M tokens") && Repository.agentLabel(new JSONObject("{\"agent\":{\"tokens\":950,\"cost\":1234.5}}")).equals("950 tokens · $1,234.50"),
            "Agent usage label parses tolerantly");
        require(MainActivity.parseDuration("2:15") == 8100 && MainActivity.hoursMinutes(5400).equals("1:30"), "Edit uses the manual-entry duration parser");

        // Native edit dialog: change duration and task, then Save sends PATCH with the displayed version.
        waitForIdleSync();
        runOnMainSync(() -> { View edit = findDescribed(activity.getWindow().getDecorView(), "Edit Native verification"); if (edit == null) throw new AssertionError("Native Edit control missing"); edit.performClick(); });
        waitForIdleSync();
        final java.util.List<android.widget.EditText> fields = new java.util.ArrayList<>();
        runOnMainSync(() -> { if (main.entryDialog == null) throw new AssertionError("Edit dialog did not open"); collect(main.entryDialog.getWindow().getDecorView(), fields); });
        require(fields.size() == 3 && fields.get(1).getText().toString().equals("1:30") && fields.get(1).isEnabled(), "Edit dialog is prefilled and duration is editable for stopped time");
        runOnMainSync(() -> {
            fields.get(0).setText("Native verification edited"); fields.get(1).setText("2:15"); fields.get(2).setText("Edited on Android");
            main.entryDialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();
        });
        await(() -> !repo.busy && entry(id) != null && entry(id).optLong("durationSeconds") == 8100 && entry(id).optString("task").equals("Native verification edited"), 20000, "Native Save persists PATCH edits");
        require(entry(id).optInt("version") == firstVersion + 1 && entry(id).optString("notes").equals("Edited on Android") && entry(id).optString("date").equals(manual.getString("date")), "PATCH sends only changed fields and bumps the version");
        await(() -> main.entryDialog == null, 5000, "Edit dialog closes after a confirmed save");

        // A stale displayed version is rejected, state is refetched, and the error remains visible.
        final int[] status = { -1 }; final String[] message = { "" };
        runOnMainSync(() -> repo.edit(id, firstVersion, new JSONObjectBuilder().put("notes", "stale overwrite").json, (saved, code, text) -> { status[0] = saved ? 200 : code; message[0] = text; }));
        await(() -> status[0] != -1 && !repo.busy, 20000, "Stale edit completes");
        require(status[0] == 409 && message[0].contains("changed") && entry(id).optString("notes").equals("Edited on Android"), "Stale PATCH gets 409, keeps server data, and shows the error");
        runOnMainSync(() -> repo.error = "");

        // Stale DELETE is rejected too.
        status[0] = -1;
        runOnMainSync(() -> repo.delete(id, firstVersion, (saved, code, text) -> status[0] = saved ? 200 : code));
        await(() -> status[0] != -1 && !repo.busy, 20000, "Stale delete completes");
        require(status[0] == 409 && entry(id) != null, "Stale DELETE gets 409 and the entry remains");
        runOnMainSync(() -> repo.error = "");

        // Agent usage from the server renders on the entry card.
        JSONObject usage = send("PATCH", server + "/api/entries/" + id, token, new JSONObject().put("version", entry(id).getInt("version")).put("agent", new JSONObject().put("tokens", 2410000).put("cost", 31.4).put("model", "claude-opus-5")));
        require(usage.getJSONObject("entry").getJSONObject("agent").getLong("tokens") == 2410000, "Agent usage accepted by the API");
        runOnMainSync(() -> repo.refresh());
        await(() -> entry(id) != null && entry(id).optJSONObject("agent") != null, 20000, "Agent usage arrives in state");
        waitForIdleSync(); Thread.sleep(300);
        final boolean[] shown = { false };
        runOnMainSync(() -> shown[0] = findText(activity.getWindow().getDecorView(), "2.41M tokens · $31.40"));
        require(shown[0], "Entry card shows 2.41M tokens · $31.40");

        // Native Delete with confirmation removes a second stopped entry.
        runOnMainSync(() -> repo.manual(projectId, "Delete me", "", java.time.LocalDate.now().toString(), 600, false));
        await(() -> !repo.busy && findTask("Delete me") != null, 20000, "Entry to delete persists");
        final String doomed = findTask("Delete me").getString("id");
        waitForIdleSync(); Thread.sleep(300);
        runOnMainSync(() -> { View edit = findDescribed(activity.getWindow().getDecorView(), "Edit Delete me"); if (edit == null) throw new AssertionError("Edit control missing for deletable entry"); edit.performClick(); });
        waitForIdleSync();
        runOnMainSync(() -> main.entryDialog.getButton(android.app.AlertDialog.BUTTON_NEUTRAL).performClick());
        waitForIdleSync();
        require(main.confirmDialog != null && main.confirmDialog.isShowing() && entry(doomed) != null, "Delete asks for confirmation before sending");
        runOnMainSync(() -> main.confirmDialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick());
        await(() -> !repo.busy && entry(doomed) == null && main.entryDialog == null, 20000, "Confirmed native Delete removes the entry");
        waitForIdleSync();
    }
    private void runningEditChecks(Activity activity, String id) throws Exception {
        MainActivity main = (MainActivity) activity;
        final int[] status = { -1 };
        runOnMainSync(() -> repo.edit(id, repo.running().optInt("version"), new JSONObjectBuilder().put("durationSeconds", 60).json, (saved, code, text) -> status[0] = saved ? 200 : code));
        await(() -> status[0] != -1 && !repo.busy, 20000, "Running duration edit completes");
        require(status[0] == 409 && repo.running() != null, "Server rejects duration changes while running");
        runOnMainSync(() -> repo.error = "");
        waitForIdleSync(); Thread.sleep(300);
        runOnMainSync(() -> { View edit = findDescribed(activity.getWindow().getDecorView(), "Edit Native verification"); if (edit == null) throw new AssertionError("Edit control missing for running entry"); edit.performClick(); });
        waitForIdleSync();
        final java.util.List<android.widget.EditText> fields = new java.util.ArrayList<>(); final boolean[] deleteShown = { true };
        runOnMainSync(() -> {
            collect(main.entryDialog.getWindow().getDecorView(), fields);
            Button delete = main.entryDialog.getButton(android.app.AlertDialog.BUTTON_NEUTRAL); deleteShown[0] = delete != null && delete.getVisibility() == View.VISIBLE;
        });
        require(fields.size() == 3 && !fields.get(1).isEnabled() && fields.get(0).isEnabled() && !deleteShown[0], "Running entry dialog disables duration and hides Delete");
        runOnMainSync(() -> { fields.get(0).setText("Running rename"); main.entryDialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick(); });
        await(() -> !repo.busy && repo.running() != null && repo.running().optString("task").equals("Running rename"), 20000, "Running entry task edit persists and the timer keeps running");
    }
    private static final class JSONObjectBuilder { final JSONObject json = new JSONObject(); JSONObjectBuilder put(String k, Object v) { try { json.put(k, v); } catch (Exception e) { throw new IllegalStateException(e); } return this; } }
    private JSONObject findTask(String task) { org.json.JSONArray all = repo.array("entries"); for (int i = 0; i < all.length(); i++) { JSONObject e = all.optJSONObject(i); if (e != null && task.equals(e.optString("task"))) return e; } return null; }
    private View findDescribed(View view, String prefix) {
        if (view.getContentDescription() != null && view.getContentDescription().toString().startsWith(prefix) && view instanceof Button) return view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) { View found = findDescribed(((ViewGroup) view).getChildAt(i), prefix); if (found != null) return found; }
        return null;
    }
    private boolean findText(View view, String value) {
        if (view instanceof android.widget.TextView && ((android.widget.TextView) view).getText().toString().equals(value)) return true;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) if (findText(((ViewGroup) view).getChildAt(i), value)) return true;
        return false;
    }
    private void collect(View view, java.util.List<android.widget.EditText> out) {
        if (view instanceof android.widget.EditText) out.add((android.widget.EditText) view);
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) collect(((ViewGroup) view).getChildAt(i), out);
    }
    private void require(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; Bundle progress = new Bundle(); progress.putString("stream", "PASS " + label + "\n"); sendStatus(0, progress); }
    private void await(BooleanSupplier condition, long timeout, String label) throws Exception {
        long deadline = System.currentTimeMillis() + timeout;
        while (!condition.getAsBoolean() && System.currentTimeMillis() < deadline) Thread.sleep(100);
        require(condition.getAsBoolean(), label + (repo.error.isEmpty() ? "" : " — " + repo.error));
    }
    private Button findButton(View view, String contains) {
        if (view instanceof Button && ((Button) view).getText().toString().contains(contains)) return (Button) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) { Button button = findButton(((ViewGroup) view).getChildAt(i), contains); if (button != null) return button; }
        return null;
    }
    private JSONObject post(String url, String token, JSONObject body) throws Exception { return send("POST", url, token, body); }
    private JSONObject send(String method, String url, String token, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod(method); connection.setDoOutput(true); connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
            connection.setRequestProperty("Authorization", "Bearer " + token); connection.setRequestProperty("Content-Type", "application/json");
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            if (connection.getResponseCode() >= 300) throw new AssertionError("Remote request failed: " + connection.getResponseCode());
            try (java.io.InputStream input = connection.getInputStream(); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                byte[] bytes = new byte[8192]; int count; while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
                return new JSONObject(output.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
    }
}
