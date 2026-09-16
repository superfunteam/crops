package com.crops.time;

import android.app.Application;

public final class CropsApp extends Application {
    public static Repository repository;
    @Override public void onCreate() { super.onCreate(); repository = new Repository(this); }
}
