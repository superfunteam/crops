package com.crops.time;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import java.io.File;
import java.io.FileOutputStream;

/** Offline migration checks using disposable session fixtures, never real credentials. */
final class OriginMigrationSmoke {
    private final Instrumentation instrument;
    private int checks;
    OriginMigrationSmoke(Instrumentation instrument) { this.instrument = instrument; }
    void run() {
        Bundle result = new Bundle();
        SharedPreferences preferences = instrument.getTargetContext().getSharedPreferences("crops", Context.MODE_PRIVATE);
        SecureSession session = new SecureSession(instrument.getTargetContext());
        try {
            instrument.waitForIdleSync();
            if (CropsApp.repository.signedIn()) throw new AssertionError("Migration checks require a signed-out disposable emulator app");
            preferences.edit().clear().commit(); session.clear();
            Repository fresh = new Repository(instrument.getTargetContext());
            require(fresh.server().equals("https://crops.wims.vc") && !fresh.signedIn(), "Fresh install uses the canonical production origin");
            preferences.edit().putString("server", Repository.LEGACY_PRODUCTION_SERVER).putString("teamId", "old-team")
                .putString("state", "{\"user\":{\"id\":\"old-user\"}}").putBoolean("persistentSync", true).commit();
            session.save("disposable-migration-session");
            Repository migrated = new Repository(instrument.getTargetContext());
            require(migrated.server().equals(Repository.DEFAULT_SERVER), "Exact previous production origin migrates");
            require(!migrated.signedIn() && session.read().isEmpty(), "Migration clears the old origin's credential");
            require(migrated.teamId().isEmpty() && migrated.state == null, "Migration clears old team and cached state");
            require(!migrated.persistentSync(), "Migration disables stale background monitoring");
            session.save("disposable-custom-session");
            preferences.edit().putString("server", "https://tracking.example.test").putString("teamId", "custom-team").commit();
            Repository custom = new Repository(instrument.getTargetContext());
            require(custom.server().equals("https://tracking.example.test") && custom.signedIn() && custom.teamId().equals("custom-team"), "Custom origin and session stay unchanged");
            preferences.edit().putString("server", "http://10.0.2.2:8789").commit();
            Repository local = new Repository(instrument.getTargetContext());
            require(local.server().equals("http://10.0.2.2:8789") && local.signedIn(), "Local origin and session stay unchanged");
            String customPath = Repository.LEGACY_PRODUCTION_SERVER + "/custom";
            preferences.edit().putString("server", customPath).commit();
            Repository nearMatch = new Repository(instrument.getTargetContext());
            require(nearMatch.server().equals(customPath) && nearMatch.signedIn(), "Migration matches only the exact previous origin");
            preferences.edit().putString("server", Repository.DEFAULT_SERVER).commit();
            Repository current = new Repository(instrument.getTargetContext());
            require(current.server().equals(Repository.DEFAULT_SERVER) && current.signedIn(), "Canonical-origin sessions survive subsequent launches");
            preferences.edit().clear().putString("server", Repository.DEFAULT_SERVER).commit(); session.clear();
            Activity activity = instrument.startActivitySync(new Intent(instrument.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            final boolean[] fieldValid = { false };
            instrument.runOnMainSync(() -> { EditText field = firstField(activity.getWindow().getDecorView()); fieldValid[0] = field != null && field.getText().toString().equals(Repository.DEFAULT_SERVER) && field.isEnabled() && field.isFocusable(); });
            require(fieldValid[0], "Native signed-out URL field shows the editable canonical origin");
            Bitmap screenshot = instrument.getUiAutomation().takeScreenshot();
            try (FileOutputStream output = new FileOutputStream(new File(instrument.getTargetContext().getFilesDir(), "origin-migration.png"))) { screenshot.compress(Bitmap.CompressFormat.PNG, 100, output); }
            screenshot.recycle();
            result.putString("stream", "\nOK (" + checks + " migration checks)\n"); instrument.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            preferences.edit().clear().putString("server", Repository.DEFAULT_SERVER).commit(); session.clear();
            result.putString("stream", "\nFAIL: " + error.getClass().getSimpleName() + ": " + error.getMessage() + "\n"); instrument.finish(Activity.RESULT_CANCELED, result);
        }
    }
    private void require(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; Bundle progress = new Bundle(); progress.putString("stream", "PASS " + label + "\n"); instrument.sendStatus(0, progress); }
    private EditText firstField(View view) { if(view instanceof EditText)return(EditText)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){EditText found=firstField(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null; }
}
