package com.crops.time;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import org.json.JSONObject;

/** The clock is derived from a server timestamp, so time survives process death. */
public final class TimerService extends Service implements Repository.Listener {
    static final String STOP = "com.crops.time.STOP", DISABLE = "com.crops.time.DISABLE";
    private static final String CHANNEL = "crops.timer";
    private static final int NOTIFICATION = 41;
    public static boolean active;
    private Repository repo;
    private final Handler handler = new Handler();
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (repo.signedIn()) repo.refresh(); update(); handler.postDelayed(this, repo.running() != null ? 5000 : 15000); }
    };
    @Override public void onCreate() {
        super.onCreate(); active = true; repo = CropsApp.repository;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Live timer", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Your running timer and cross-device synchronization"); channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTIFICATION, notification());
        repo.addListener(this); handler.post(poll);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            String id = intent.getStringExtra("entryId");
            int version = intent.getIntExtra("version", 0);
            // Bind Stop to the displayed revision, including when another device
            // has stopped and resumed this same entry since it was displayed.
            if (id != null && version > 0) repo.stop(id, version);
            else repo.refresh();
        } else if (intent != null && DISABLE.equals(intent.getAction())) { repo.persistentSync(false); stopSelf(); }
        else update();
        return START_STICKY;
    }
    @Override public void changed() {
        update();
        // A timer discovered by an idle poll should immediately switch to the
        // active cadence, rather than wait out another full idle interval.
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, repo.running() != null ? 5000 : 15000);
    }
    private void update() {
        if (!repo.signedIn() || (repo.running() == null && !repo.persistentSync() && !repo.busy)) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return; }
        getSystemService(NotificationManager.class).notify(NOTIFICATION, notification());
    }
    private Notification notification() {
        JSONObject running = repo.running();
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setColor(0xFF285A43).setCategory(Build.VERSION.SDK_INT >= 31 ? Notification.CATEGORY_STOPWATCH : Notification.CATEGORY_PROGRESS);
        if (running == null) {
            Intent disable = new Intent(this, TimerService.class).setAction(DISABLE);
            builder.setContentTitle("Crops is ready").setContentText(repo.error.isEmpty() ? "Watching for timers on your other devices" : "Sync paused · " + repo.error)
                .setShowWhen(false).addAction(new Notification.Action.Builder(null, "Pause sync", PendingIntent.getService(this, 2, disable, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
        } else {
            String task = running.optString("task");
            String entryId = running.optString("id");
            int displayedVersion = running.optInt("version");
            Intent stop = new Intent(this, TimerService.class).setAction(STOP)
                .setData(android.net.Uri.parse("crops://timer/" + android.net.Uri.encode(entryId) + "/" + displayedVersion))
                .putExtra("entryId", entryId).putExtra("version", displayedVersion);
            builder.setContentTitle(repo.projectName(running.optString("projectId")))
                .setContentText(repo.error.isEmpty() ? (task.isEmpty() ? "Time is growing. You’re in sync." : task) : "Sync paused · timer continues")
                .setWhen(System.currentTimeMillis() - repo.duration(running) * 1000).setUsesChronometer(true).setShowWhen(true)
                .addAction(new Notification.Action.Builder(null, repo.busy ? "Saving…" : "Stop timer", PendingIntent.getService(this, running.optString("id").hashCode(), stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
        }
        return builder.build();
    }
    @Override public void onDestroy() { active = false; handler.removeCallbacksAndMessages(null); repo.removeListener(this); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
