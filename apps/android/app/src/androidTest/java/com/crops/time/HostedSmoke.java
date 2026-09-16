package com.crops.time;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Switch;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;

/** Opt-in hosted GUI smoke. Credentials arrive in the debug app's private files, never APK/resources. */
final class HostedSmoke {
    private final Instrumentation instrument;
    private Repository repo;
    private String origin, token = "";
    private int checks;
    HostedSmoke(Instrumentation instrument) { this.instrument = instrument; }
    void run() {
        Bundle result = new Bundle();
        File credentials = new File(instrument.getTargetContext().getFilesDir(), "production-smoke.json");
        try {
            instrument.waitForIdleSync(); repo = CropsApp.repository;
            JSONObject login;
            try (InputStream input = new FileInputStream(credentials)) { login = new JSONObject(read(input)); }
            credentials.delete();
            origin = login.getString("origin");
            require(origin.equals(Repository.DEFAULT_SERVER), "Authorized production origin");
            if (repo.signedIn()) instrument.runOnMainSync(repo::logout);
            Activity activity = instrument.startActivitySync(new Intent(instrument.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            instrument.runOnMainSync(() -> {
                List<EditText> fields = fields(activity.getWindow().getDecorView());
                if (fields.size() != 3) throw new AssertionError("Expected native login fields");
                fields.get(0).setText(origin); fields.get(1).setText(login.optString("username")); fields.get(2).setText(login.optString("password"));
                button(activity, "Sign in").performClick();
            });
            await(() -> !repo.busy && repo.signedIn() && repo.state != null, 30000, "Native GUI signs in over production HTTPS");
            require(repo.state.getJSONObject("user").getString("id").equals(login.getString("userId")) && repo.teamId().equals(login.getString("teamId")), "Signed into the isolated QA identity and team");
            token = new SecureSession(instrument.getTargetContext()).read();
            require(!token.isEmpty(), "Production session stored in Android Keystore");
            String projectId = repo.array("projects").getJSONObject(0).getString("id");
            instrument.waitForIdleSync();
            instrument.runOnMainSync(() -> {
                List<EditText> fields = fields(activity.getWindow().getDecorView());
                if (fields.size() != 2) throw new AssertionError("Expected native timer task and notes fields");
                fields.get(0).setText("Android hosted smoke"); fields.get(1).setText("Disposable production verification");
                button(activity, "Start timer").performClick();
            });
            await(() -> !repo.busy && repo.running() != null, 25000, "Native Start persists a hosted timer");
            String firstId = repo.running().getString("id");
            require(repo.running().getString("task").equals("Android hosted smoke"), "Hosted entry keeps native task details");
            await(() -> TimerService.active, 5000, "Hosted timer has a foreground service");
            long baselineSeconds = repo.duration(repo.running()), baselineSync = repo.lastSyncedAt;
            Thread.sleep(17000);
            require(repo.lastSyncedAt >= baselineSync + 10000, "Hosted timer crosses multiple successful polling cycles");
            require(repo.running() != null && repo.running().optString("id").equals(firstId) && repo.duration(repo.running()) >= baselineSeconds + 15, "Hosted elapsed time advances across proxy 304 responses");
            capture("hosted-running.png");
            NotificationManager manager = instrument.getTargetContext().getSystemService(NotificationManager.class);
            await(() -> manager.getActiveNotifications().length > 0, 5000, "Hosted timer notification is visible");
            StatusBarNotification notification = manager.getActiveNotifications()[0];
            require(notification.getNotification().extras.getBoolean("android.showChronometer"), "Hosted notification uses Android's live chronometer");
            shell("cmd statusbar expand-notifications"); Thread.sleep(700); capture("hosted-notification.png"); shell("cmd statusbar collapse");
            notification.getNotification().actions[0].actionIntent.send();
            await(() -> !repo.busy && repo.running() == null, 25000, "Notification Stop synchronizes to production");
            JSONObject confirmed = request("/api/state", "GET", null);
            require(confirmed.isNull("runningEntry"), "Independent hosted state confirms timer stopped");
            instrument.waitForIdleSync();
            instrument.runOnMainSync(() -> button(activity, "Settings").performClick());
            instrument.runOnMainSync(() -> syncSwitch(activity.getWindow().getDecorView()).setChecked(true));
            await(() -> TimerService.active && repo.persistentSync(), 5000, "Native Settings enables background cross-device sync");
            instrument.runOnMainSync(() -> activity.moveTaskToBack(true));
            JSONObject remote = request("/api/timer/start", "POST", new JSONObject().put("teamId", repo.teamId()).put("projectId", projectId)
                .put("task", "Remote hosted smoke").put("notes", "Disposable production verification").put("date", LocalDate.now().toString()).put("billable", false));
            String remoteId = remote.getJSONObject("entry").getString("id");
            await(() -> repo.running() != null && repo.running().optString("id").equals(remoteId), 30000, "Background Android discovers a hosted remote timer");
            request("/api/timer/stop", "POST", new JSONObject().put("entryId", remoteId).put("version", remote.getJSONObject("entry").getInt("version")));
            await(() -> repo.running() == null, 20000, "Hosted remote Stop synchronizes back to Android");
            instrument.runOnMainSync(() -> activity.startActivity(new Intent(instrument.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));
            await(activity::hasWindowFocus, 5000, "Native app returns to foreground");
            instrument.runOnMainSync(() -> { syncSwitch(activity.getWindow().getDecorView()).setChecked(false); button(activity, "Sign out").performClick(); });
            await(() -> !repo.signedIn() && !TimerService.active, 5000, "Native GUI signs out and stops its foreground service");
            require(new SecureSession(instrument.getTargetContext()).read().isEmpty(), "Production session removed from Keystore-backed storage");
            boolean revoked = false;
            for (int attempt = 0; attempt < 10 && !revoked; attempt++) {
                try { request("/api/state", "GET", null); Thread.sleep(250); }
                catch (HttpFailure error) { if (error.status == 401) revoked = true; else throw error; }
            }
            require(revoked, "Hosted session is revoked after logout");
            require(repo.server().equals(origin), "Signed-out app retains the production origin");
            capture("hosted-signed-out.png");
            result.putString("stream", "\nOK (" + checks + " hosted checks)\n");
            instrument.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            if (repo != null) {
                try { if (repo.running() != null) request("/api/timer/stop", "POST", new JSONObject().put("entryId", repo.running().optString("id")).put("version", repo.running().optInt("version"))); } catch (Exception ignored) {}
                instrument.runOnMainSync(() -> { repo.persistentSync(false); instrument.getTargetContext().stopService(new Intent(instrument.getTargetContext(), TimerService.class)); repo.logout(); });
            }
            result.putString("stream", "\nFAIL after " + checks + " hosted checks: " + error.getClass().getSimpleName() + ": " + error.getMessage() + "\n");
            instrument.finish(Activity.RESULT_CANCELED, result);
        } finally { credentials.delete(); }
    }
    private void require(boolean condition, String label) { if (!condition) throw new AssertionError(label + (repo == null || repo.error.isEmpty() ? "" : " — " + repo.error)); checks++; Bundle progress = new Bundle(); progress.putString("stream", "PASS " + label + "\n"); instrument.sendStatus(0, progress); }
    private void await(BooleanSupplier condition, long timeout, String label) throws Exception { long until = System.currentTimeMillis() + timeout; while (!condition.getAsBoolean() && System.currentTimeMillis() < until) Thread.sleep(100); require(condition.getAsBoolean(), label); }
    private List<EditText> fields(View view) { List<EditText> found = new ArrayList<>(); collect(view, found); return found; }
    private void collect(View view, List<EditText> found) { if (view instanceof EditText) found.add((EditText) view); if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++) collect(((ViewGroup)view).getChildAt(i), found); }
    private Button button(Activity activity, String contains) { Button found = findButton(activity.getWindow().getDecorView(), contains); if(found == null) throw new AssertionError("Native button missing: " + contains); return found; }
    private Button findButton(View view, String contains) { if(view instanceof Button && ((Button)view).getText().toString().contains(contains)) return (Button)view; if(view instanceof ViewGroup) for(int i=0;i<((ViewGroup)view).getChildCount();i++){Button found=findButton(((ViewGroup)view).getChildAt(i),contains);if(found!=null)return found;}return null; }
    private Switch syncSwitch(View view) { if(view instanceof Switch)return(Switch)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){Switch found=syncSwitch(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null; }
    private void capture(String filename) throws Exception { Bitmap screenshot=instrument.getUiAutomation().takeScreenshot(); if(screenshot==null)throw new AssertionError("Screenshot unavailable");try(FileOutputStream output=new FileOutputStream(new File(instrument.getTargetContext().getFilesDir(),filename))){screenshot.compress(Bitmap.CompressFormat.PNG,100,output);}screenshot.recycle(); }
    private void shell(String command) throws Exception { try(android.os.ParcelFileDescriptor descriptor=instrument.getUiAutomation().executeShellCommand(command);InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor)){read(input);} }
    private JSONObject request(String path,String method,JSONObject body)throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(origin+path).openConnection();
        try{connection.setRequestMethod(method);connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(java.io.OutputStream output=connection.getOutputStream()){output.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            int status=connection.getResponseCode();if(status>=300)throw new HttpFailure(status);
            try(InputStream input=connection.getInputStream()){return new JSONObject(read(input));}
        }finally{connection.disconnect();}
    }
    private String read(InputStream input)throws Exception{try(ByteArrayOutputStream output=new ByteArrayOutputStream()){byte[]bytes=new byte[8192];int count;while((count=input.read(bytes))!=-1)output.write(bytes,0,count);return output.toString("UTF-8");}}
    private static class HttpFailure extends Exception{final int status;HttpFailure(int status){super("Hosted HTTP status "+status);this.status=status;}}
}
