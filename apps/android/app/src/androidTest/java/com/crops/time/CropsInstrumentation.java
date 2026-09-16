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
            runOnMainSync(() -> repo.start(projectId, "Native verification", "", true, resumeId));
            await(() -> !repo.busy && repo.running() != null && repo.running().optString("id").equals(resumeId), 20000, "Resume preserves the same time entry");
            require(repo.duration(repo.running()) >= 5400, "Resume includes accumulated duration");
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
    private JSONObject post(String url, String token, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
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
