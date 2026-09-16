package com.crops.time;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Real Android controls throughout, with no third-party runtime dependencies. */
public final class MainActivity extends Activity implements Repository.Listener {
    private static final int BG = 0xFFF6F5EF, GREEN = 0xFF285A43, INK = 0xFF213A30, MUTED = 0xFF727B71, LINE = 0xFFE0E4DA, LIME = 0xFFDCEEA5;
    private Repository repo;
    private LinearLayout root, page, body, entries;
    private TextView syncStatus, timerClock, totalClock, loginError;
    private EditText serverInput, usernameInput, passwordInput, nameInput, teamInput, taskInput, notesInput;
    private Button submit, startStop;
    private Spinner projectSpinner;
    private CheckBox billableInput;
    private final List<JSONObject> projectOptions = new ArrayList<>();
    private String projectId = "", draftTask = "", draftNotes = "", screenSignature = "";
    private boolean billable = true, register, resumed, loginView;
    private int tab;
    private LocalDate date = LocalDate.now();
    private final Handler handler = new Handler();
    private final Runnable tick = new Runnable() {
        @Override public void run() { updateClocks(); handler.postDelayed(this, 1000); }
    };
    private final Runnable refresh = new Runnable() {
        @Override public void run() { if (repo.signedIn() && !TimerService.active) repo.refresh(); handler.postDelayed(this, 5000); }
    };
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState); repo = CropsApp.repository;
        if (savedInstanceState != null) {
            tab = savedInstanceState.getInt("tab"); projectId = savedInstanceState.getString("projectId", "");
            draftTask = savedInstanceState.getString("task", ""); draftNotes = savedInstanceState.getString("notes", "");
            billable = savedInstanceState.getBoolean("billable", true); date = LocalDate.parse(savedInstanceState.getString("date", LocalDate.now().toString()));
        }
        repo.addListener(this); render();
    }
    @Override protected void onResume() { super.onResume(); resumed = true; handler.post(tick); handler.post(refresh); ensureService(); }
    @Override protected void onPause() { resumed = false; handler.removeCallbacksAndMessages(null); super.onPause(); }
    @Override protected void onDestroy() { repo.removeListener(this); super.onDestroy(); }
    @Override protected void onSaveInstanceState(Bundle saved) {
        captureDraft(); saved.putInt("tab", tab); saved.putString("projectId", projectId); saved.putString("task", draftTask); saved.putString("notes", draftNotes);
        saved.putBoolean("billable", billable); saved.putString("date", date.toString()); super.onSaveInstanceState(saved);
    }
    @Override public void changed() {
        if (loginView != !repo.signedIn() || (!loginView && !signature().equals(screenSignature))) {
            captureDraft(); render();
        }
        if (loginError != null && loginView) loginError.setText(repo.error);
        if (submit != null && loginView) { submit.setEnabled(!repo.busy); submit.setText(repo.busy ? "Connecting…" : register ? "Create your workspace" : "Sign in"); }
        if (startStop != null && !loginView) startStop.setEnabled(!repo.busy && (repo.running() != null || !projectOptions.isEmpty()));
        updateClocks(); ensureService();
    }
    private String signature() {
        if (repo.state == null) return "loading";
        return repo.array("teams").toString() + repo.array("projects") + repo.array("entries") + repo.running() + repo.teamId();
    }
    private void captureDraft() {
        if (taskInput != null) draftTask = taskInput.getText().toString();
        if (notesInput != null) draftNotes = notesInput.getText().toString();
        if (billableInput != null) billable = billableInput.isChecked();
        if (projectSpinner != null && projectSpinner.getSelectedItemPosition() >= 0 && projectSpinner.getSelectedItemPosition() < projectOptions.size())
            projectId = projectOptions.get(projectSpinner.getSelectedItemPosition()).optString("id");
    }
    private void render() {
        taskInput = null; notesInput = null; projectSpinner = null; billableInput = null; timerClock = null; totalClock = null; startStop = null; loginError = null; submit = null; entries = null;
        loginView = !repo.signedIn(); screenSignature = signature();
        root = column(); root.setBackgroundColor(BG); root.setPadding(dp(22), dp(20), dp(22), dp(12));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) { android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime()); root.setPadding(dp(22) + bars.left, dp(12) + bars.top, dp(22) + bars.right, dp(10) + bars.bottom); }
            else root.setPadding(dp(22), dp(12) + insets.getSystemWindowInsetTop(), dp(22), dp(10) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);
        if (loginView) { login(); return; }
        header();
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setClipToPadding(false);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        page = column(); page.setPadding(0, dp(22), 0, dp(20)); scroll.addView(page);
        if (repo.state == null) { page.addView(text("Getting your workspace…", 25, INK, true)); page.addView(text("Your time will be here in a moment.", 15, MUTED, false)); }
        else if (tab == 0) timerPage(); else if (tab == 1) timesheetPage(); else settingsPage();
        navigation(); updateClocks();
    }
    private void header() {
        LinearLayout row = row(); row.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.ic_crops); logo.setContentDescription("Crops"); row.addView(logo, new LinearLayout.LayoutParams(dp(34), dp(34)));
        TextView brand = text("crops", 26, INK, true); brand.setPadding(dp(9), 0, 0, 0); row.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        JSONObject user = repo.state == null ? null : repo.state.optJSONObject("user");
        TextView avatar = text(user == null ? "C" : user.optString("name", "C").substring(0, 1).toUpperCase(Locale.US), 15, GREEN, true);
        avatar.setGravity(Gravity.CENTER); avatar.setBackground(shape(0xFFE6ECDC, 30, 0)); row.addView(avatar, new LinearLayout.LayoutParams(dp(36), dp(36))); root.addView(row);
        syncStatus = text("Connecting…", 12, MUTED, false); syncStatus.setPadding(0, dp(12), 0, 0); syncStatus.setOnClickListener(v -> repo.refresh()); root.addView(syncStatus);
    }
    private void login() {
        ScrollView scroll = new ScrollView(this); root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
        LinearLayout content = column(); content.setPadding(0, dp(30), 0, dp(20)); scroll.addView(content);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.ic_crops); content.addView(logo, new LinearLayout.LayoutParams(dp(54), dp(54)));
        TextView brand = text("crops", 36, INK, true); margin(content, brand, 12);
        margin(content, text("A little time.\nA lot of growth.", 33, INK, true), 30);
        TextView subtitle = text("Simple time tracking, together.", 16, MUTED, false); margin(content, subtitle, 12);
        LinearLayout form = card(Color.WHITE); margin(content, form, 30);
        serverInput = field(form, "Workspace URL", Repository.DEFAULT_SERVER, repo.server(), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        usernameInput = field(form, "Username", "Your username", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        passwordInput = field(form, "Password", "Your password", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        if (register) { nameInput = field(form, "Your name", "Alex Morgan", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS); teamInput = field(form, "Team name", "Your studio", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS); }
        loginError = text(repo.error, 13, 0xFFA23831, false); margin(form, loginError, 8);
        submit = button(register ? "Create your workspace" : "Sign in", GREEN, Color.WHITE);
        submit.setOnClickListener(v -> {
            if (usernameInput.getText().toString().trim().isEmpty() || passwordInput.getText().toString().isEmpty()) { loginError.setText("Enter your username and password."); return; }
            repo.login(serverInput.getText().toString(), usernameInput.getText().toString(), passwordInput.getText().toString(), register ? nameInput.getText().toString() : null,
                register ? teamInput.getText().toString() : null, success -> { if (success) { render(); ensureService(); } });
        }); margin(form, submit, 12);
        Button toggle = button(register ? "Already have an account? Sign in" : "New here? Create a workspace", BG, GREEN);
        toggle.setOnClickListener(v -> { register = !register; render(); }); margin(content, toggle, 14);
        margin(content, text("Use the same workspace URL on your Mac and the web. Your team, projects, and timer stay together.", 13, MUTED, false), 20);
    }
    private void teamPicker(LinearLayout container) {
        JSONArray teams = repo.array("teams"); if (teams.length() == 0) return;
        if (teams.length() == 1) { margin(container, text(teams.optJSONObject(0).optString("name").toUpperCase(Locale.US), 11, MUTED, true), 0); return; }
        List<String> names = new ArrayList<>(); int selected = 0;
        for (int i = 0; i < teams.length(); i++) { JSONObject team = teams.optJSONObject(i); names.add(team.optString("name")); if (team.optString("id").equals(repo.teamId())) selected = i; }
        Spinner picker = spinner(names); picker.setSelection(selected); container.addView(picker);
        picker.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> p, View v, int position, long id) {
                String next = teams.optJSONObject(position).optString("id"); if (!next.equals(repo.teamId())) { captureDraft(); projectId = ""; repo.selectTeam(next); }
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> p) {}
        });
    }
    private void timerPage() {
        teamPicker(page);
        margin(page, text("Time well spent.", 31, INK, true), 12);
        margin(page, text(LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, MMMM d")), 14, MUTED, false), 7);
        JSONObject running = repo.running();
        LinearLayout timerCard = card(running == null ? 0xFFEAF0DF : GREEN); margin(page, timerCard, 26);
        TextView eyebrow = text(running == null ? "READY WHEN YOU ARE" : "●  GROWING YOUR DAY", 11, running == null ? GREEN : LIME, true); timerCard.addView(eyebrow);
        timerClock = text(running == null ? "00:00:00" : Repository.clock(repo.duration(running)), 44, running == null ? GREEN : Color.WHITE, false);
        timerClock.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL)); margin(timerCard, timerClock, 8);
        if (running != null) {
            margin(timerCard, text(repo.projectName(running.optString("projectId")), 19, Color.WHITE, true), 8);
            if (!running.optString("task").isEmpty()) margin(timerCard, text(running.optString("task"), 14, 0xFFD8E4D6, false), 6);
            startStop = button("■  Stop timer", LIME, INK); startStop.setOnClickListener(v -> repo.stop(running.optString("id"), running.optInt("version"))); margin(timerCard, startStop, 22);
        } else {
            margin(timerCard, text("Choose a project. Find your flow.", 14, GREEN, false), 6);
            populateProjectOptions();
            if (projectOptions.isEmpty()) margin(timerCard, text("Add your first project in the web workspace, then tap the sync status above.", 15, GREEN, false), 20);
            else {
                projectSpinner = projectPicker(timerCard, projectOptions, projectId);
                taskInput = field(timerCard, "Task", "What are you working on?", draftTask, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
                notesInput = field(timerCard, "Notes", "A little context (optional)", draftNotes, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
                billableInput = check("Billable time", billable); margin(timerCard, billableInput, 7);
            }
            startStop = button("▶  Start timer", GREEN, Color.WHITE); startStop.setEnabled(!projectOptions.isEmpty());
            startStop.setOnClickListener(v -> { captureDraft(); requestNotifications(); repo.start(projectId, draftTask.trim().isEmpty() ? "General" : draftTask, draftNotes, billable, null); }); margin(timerCard, startStop, 16);
        }
        LinearLayout day = row(); day.setGravity(Gravity.CENTER_VERTICAL); margin(page, day, 27);
        day.addView(text("Today", 21, INK, true), new LinearLayout.LayoutParams(0, -2, 1)); totalClock = text("0h 00m", 20, GREEN, true); day.addView(totalClock);
        entries = column(); margin(page, entries, 12); fillEntries(LocalDate.now(), 5);
        Button add = button("+  Add time manually", BG, GREEN); add.setOnClickListener(v -> manualDialog()); margin(page, add, 12);
    }
    private void timesheetPage() {
        teamPicker(page); margin(page, text("Your timesheet", 31, INK, true), 12);
        margin(page, text("A clear view of where your time grows.", 14, MUTED, false), 8);
        LinearLayout dates = row(); dates.setGravity(Gravity.CENTER_VERTICAL); margin(page, dates, 24);
        Button previous = button("‹", Color.WHITE, GREEN); dates.addView(previous, new LinearLayout.LayoutParams(dp(45), dp(46)));
        Button current = button(date.equals(LocalDate.now()) ? "Today, " + date.format(DateTimeFormatter.ofPattern("MMM d")) : date.format(DateTimeFormatter.ofPattern("EEE, MMM d")), BG, INK);
        dates.addView(current, new LinearLayout.LayoutParams(0, dp(46), 1));
        Button next = button("›", Color.WHITE, GREEN); next.setEnabled(date.isBefore(LocalDate.now())); dates.addView(next, new LinearLayout.LayoutParams(dp(45), dp(46)));
        previous.setOnClickListener(v -> { date = date.minusDays(1); render(); }); next.setOnClickListener(v -> { date = date.plusDays(1); render(); });
        current.setOnClickListener(v -> new DatePickerDialog(this, (picker, year, month, day) -> { date = LocalDate.of(year, month+1, day); render(); }, date.getYear(), date.getMonthValue()-1, date.getDayOfMonth()).show());
        LinearLayout total = card(0xFFEAF0DF); margin(page, total, 20); total.addView(text("TOTAL TIME", 11, GREEN, true)); totalClock = text("0h 00m", 38, GREEN, false); margin(total, totalClock, 8);
        entries = column(); margin(page, entries, 20); fillEntries(date, 1000);
        Button add = button("+  Add time", GREEN, Color.WHITE); add.setOnClickListener(v -> manualDialog()); margin(page, add, 16);
        margin(page, text("Invoice and paid statuses are managed by your team in the web workspace.", 12, MUTED, false), 18);
    }
    private void settingsPage() {
        margin(page, text("Your workspace", 31, INK, true), 0); margin(page, text("One timer. Everywhere you work.", 14, MUTED, false), 8);
        LinearLayout profile = card(Color.WHITE); margin(page, profile, 26);
        JSONObject user = repo.state.optJSONObject("user"); profile.addView(text(user == null ? "" : user.optString("name"), 22, INK, true));
        margin(profile, text(user == null ? "" : "@" + user.optString("username"), 14, MUTED, false), 5);
        margin(profile, text(repo.server(), 13, GREEN, false), 18); teamPicker(profile);
        LinearLayout sync = card(Color.WHITE); margin(page, sync, 16);
        Switch persistent = new Switch(this); persistent.setText("Live cross-device sync"); persistent.setTextSize(16); persistent.setTextColor(INK); persistent.setChecked(repo.persistentSync()); sync.addView(persistent);
        margin(sync, text("Keep a quiet notification while idle to catch timers started on your Mac or the web. Running timers always stay in the notification.", 14, MUTED, false), 14);
        margin(sync, text("Syncs about every 5 seconds while tracking and every 15 seconds while idle. Android battery restrictions and connectivity can delay updates.", 12, MUTED, false), 12);
        persistent.setOnCheckedChangeListener((b, checked) -> { repo.persistentSync(checked); if (checked) requestNotifications(); ensureService(); if (!checked && repo.running() == null) stopService(new Intent(this, TimerService.class)); });
        Button notifications = button("Notification settings", BG, GREEN); notifications.setOnClickListener(v -> startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()))); margin(page, notifications, 12);
        Button syncNow = button("Sync now", BG, GREEN); syncNow.setOnClickListener(v -> repo.refresh()); margin(page, syncNow, 4);
        Button signOut = button("Sign out", Color.WHITE, 0xFFA23831); signOut.setOnClickListener(v -> { if (repo.running() != null) Toast.makeText(this, "Your timer continues in your workspace.", Toast.LENGTH_LONG).show(); stopService(new Intent(this, TimerService.class)); repo.logout(); }); margin(page, signOut, 22);
        margin(page, text("CROPS  1.0.1\nNative, simple, and made for your team.", 12, MUTED, false), 30);
    }
    private void fillEntries(LocalDate target, int limit) {
        JSONArray all = repo.array("entries"); int count = 0;
        JSONObject user = repo.state.optJSONObject("user"); String userId = user == null ? "" : user.optString("id");
        for (int i = 0; i < all.length(); i++) {
            JSONObject entry = all.optJSONObject(i);
            if (entry == null || !target.toString().equals(entry.optString("date")) || !userId.equals(entry.optString("userId"))) continue;
            if (++count > limit) continue;
            LinearLayout card = card(Color.WHITE); margin(entries, card, 8);
            LinearLayout row = row(); row.setGravity(Gravity.CENTER_VERTICAL); card.addView(row);
            LinearLayout details = column(); row.addView(details, new LinearLayout.LayoutParams(0, -2, 1));
            details.addView(text(repo.projectName(entry.optString("projectId")), 16, INK, true));
            margin(details, text(entry.optString("task", "General"), 13, MUTED, false), 5);
            boolean isRunning = !entry.isNull("startedAt") && !entry.optString("startedAt").isEmpty();
            TextView duration = text(Repository.clock(repo.duration(entry)), 16, GREEN, true); duration.setTag(entry); row.addView(duration);
            String status = entry.optString("status", "unbilled");
            LinearLayout footer = row(); footer.setGravity(Gravity.CENTER_VERTICAL); margin(card, footer, 9);
            String label = isRunning ? "●  Tracking" : "paid".equals(status) ? "✓  Paid" : "invoiced".equals(status) ? "Invoiced" : entry.optBoolean("billable") ? "Billable · Unbilled" : "Non-billable";
            footer.addView(text(label, 11, MUTED, false), new LinearLayout.LayoutParams(0, -2, 1));
            if (!isRunning && "unbilled".equals(status)) {
                Button resume = button("▶ Resume", Color.WHITE, GREEN); resume.setTextSize(12); resume.setMinHeight(0); footer.addView(resume, new LinearLayout.LayoutParams(-2, dp(38)));
                resume.setEnabled(!repo.busy); resume.setOnClickListener(v -> { requestNotifications(); repo.start(entry.optString("projectId"), entry.optString("task", "General"), entry.optString("notes"), entry.optBoolean("billable"), entry.optString("id")); });
            }
            if (!entry.optString("notes").isEmpty()) margin(card, text(entry.optString("notes"), 12, MUTED, false), 5);
        }
        if (count == 0) {
            LinearLayout empty = card(Color.WHITE); entries.addView(empty);
            empty.addView(text("Room to grow", 18, INK, true)); margin(empty, text("No time logged for this day yet.", 14, MUTED, false), 8);
        } else if (count > limit) margin(entries, text("See all " + count + " entries in your timesheet.", 13, MUTED, false), 12);
    }
    private void updateClocks() {
        if (syncStatus != null && !loginView) {
            String status;
            if (!repo.error.isEmpty()) status = "○  " + repo.error + " · Tap to retry";
            else if (repo.busy) status = "◌  Saving…";
            else if (repo.lastSyncedAt == 0) status = "◌  Connecting to your workspace…";
            else { long ago = (System.currentTimeMillis() - repo.lastSyncedAt) / 1000; status = ago < 20 ? "●  All in sync" : "○  Last synced " + ago + "s ago · Tap to refresh"; }
            syncStatus.setText(status); syncStatus.setTextColor(repo.error.isEmpty() ? GREEN : 0xFFA23831);
        }
        JSONObject running = repo.running(); if (timerClock != null) timerClock.setText(running == null ? "00:00:00" : Repository.clock(repo.duration(running)));
        if (totalClock != null && repo.state != null) {
            LocalDate target = tab == 0 ? LocalDate.now() : date; long seconds = 0;
            JSONObject user = repo.state.optJSONObject("user"); String userId = user == null ? "" : user.optString("id"); JSONArray all = repo.array("entries");
            for (int i = 0; i < all.length(); i++) { JSONObject entry = all.optJSONObject(i); if (entry != null && userId.equals(entry.optString("userId")) && target.toString().equals(entry.optString("date"))) seconds += repo.duration(entry); }
            totalClock.setText(String.format(Locale.US, "%dh %02dm", seconds / 3600, seconds / 60 % 60));
        }
        if (entries != null) updateEntryClocks(entries);
    }
    private void updateEntryClocks(View view) {
        if (view instanceof TextView && view.getTag() instanceof JSONObject) ((TextView) view).setText(Repository.clock(repo.duration((JSONObject) view.getTag())));
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) updateEntryClocks(((ViewGroup) view).getChildAt(i));
    }
    private void navigation() {
        LinearLayout nav = row(); nav.setPadding(dp(5), dp(5), dp(5), dp(5)); nav.setBackground(shape(0xFFE9ECE3, 24, 0)); root.addView(nav);
        String[] labels = { "◷  Timer", "▤  Timesheet", "⚙  Settings" };
        for (int i = 0; i < labels.length; i++) { int selected = i; Button button = button(labels[i], tab == i ? Color.WHITE : 0xFFE9ECE3, tab == i ? GREEN : MUTED); button.setTextSize(12); nav.addView(button, new LinearLayout.LayoutParams(0, dp(46), 1)); button.setOnClickListener(v -> { captureDraft(); tab = selected; render(); }); }
    }
    private void populateProjectOptions() {
        projectOptions.clear(); JSONArray projects = repo.array("projects");
        for (int i = 0; i < projects.length(); i++) { JSONObject project = projects.optJSONObject(i); if (project != null && !project.optBoolean("archived")) projectOptions.add(project); }
    }
    private void manualDialog() {
        populateProjectOptions();
        if (projectOptions.isEmpty()) { Toast.makeText(this, "Add a project in your web workspace first.", Toast.LENGTH_LONG).show(); return; }
        List<JSONObject> manualProjects = new ArrayList<>(projectOptions);
        LinearLayout content = column(); content.setPadding(dp(24), dp(10), dp(24), dp(5));
        Spinner project = projectPicker(content, manualProjects, projectId);
        EditText task = field(content, "Task", "What did you work on?", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        EditText duration = field(content, "Duration (hours:minutes)", "1:30", "", InputType.TYPE_CLASS_DATETIME | InputType.TYPE_DATETIME_VARIATION_TIME);
        final LocalDate[] selectedDate = { tab == 1 ? date : LocalDate.now() };
        Button dateButton = button(selectedDate[0].format(DateTimeFormatter.ofPattern("EEE, MMM d, yyyy")), BG, GREEN); margin(content, dateButton, 12);
        dateButton.setOnClickListener(v -> new DatePickerDialog(this, (picker, y, m, d) -> { selectedDate[0] = LocalDate.of(y, m+1, d); dateButton.setText(selectedDate[0].format(DateTimeFormatter.ofPattern("EEE, MMM d, yyyy"))); }, selectedDate[0].getYear(), selectedDate[0].getMonthValue()-1, selectedDate[0].getDayOfMonth()).show());
        EditText notes = field(content, "Notes", "Optional context", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        CheckBox billable = check("Billable time", true); margin(content, billable, 8);
        ScrollView scroll = new ScrollView(this); scroll.addView(content);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Add time").setView(scroll).setNegativeButton("Cancel", null).setPositiveButton("Save time", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (repo.busy) { Toast.makeText(this, "Finishing your previous change. Try again in a moment.", Toast.LENGTH_SHORT).show(); return; }
            if (!repo.signedIn()) { Toast.makeText(this, "Sign in again before saving time.", Toast.LENGTH_SHORT).show(); return; }
            try {
                String value = duration.getText().toString().trim();
                if (!value.matches("\\d{1,2}:[0-5]\\d")) throw new Exception("Use hours:minutes, for example 1:30.");
                String[] parts = value.split(":"); long seconds = Long.parseLong(parts[0]) * 3600 + Long.parseLong(parts[1]) * 60;
                if (seconds <= 0 || seconds > 86400) throw new Exception("Enter a duration between 0:01 and 24:00.");
                JSONObject selected = manualProjects.get(project.getSelectedItemPosition());
                repo.manual(selected.optString("id"), task.getText().toString().trim().isEmpty() ? "General" : task.getText().toString(), notes.getText().toString(), selectedDate[0].toString(), seconds, billable.isChecked()); dialog.dismiss();
            } catch (Exception invalid) { duration.setError(invalid.getMessage()); }
        })); dialog.show();
    }
    private void requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 42);
    }
    private void ensureService() {
        if (!repo.signedIn()) { if (TimerService.active) stopService(new Intent(this, TimerService.class)); return; }
        if (resumed && !TimerService.active && (repo.running() != null || repo.persistentSync())) {
            try { startForegroundService(new Intent(this, TimerService.class)); }
            catch (Exception error) { Toast.makeText(this, "Open Crops to restore the timer notification.", Toast.LENGTH_SHORT).show(); }
        }
    }
    private Spinner projectPicker(LinearLayout parent, List<JSONObject> projects, String selectedId) {
        margin(parent, text("Project", 12, MUTED, true), 18); List<String> labels = new ArrayList<>(); int selection = 0;
        for (int i = 0; i < projects.size(); i++) { JSONObject p = projects.get(i); labels.add(p.optString("name")); if (p.optString("id").equals(selectedId)) selection = i; }
        Spinner spinner = spinner(labels); spinner.setSelection(selection); margin(parent, spinner, 6); return spinner;
    }
    private Spinner spinner(List<String> labels) {
        Spinner spinner = new Spinner(this, Spinner.MODE_DROPDOWN);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels);
        spinner.setAdapter(adapter); spinner.setBackgroundTintList(ColorStateList.valueOf(GREEN)); spinner.setMinimumHeight(dp(48)); return spinner;
    }
    private EditText field(LinearLayout parent, String label, String hint, String value, int input) {
        margin(parent, text(label, 12, MUTED, true), 16); EditText field = new EditText(this); field.setSingleLine(true); field.setTextSize(16); field.setTextColor(INK);
        field.setHintTextColor(0xFF979F95); field.setHint(hint); field.setText(value); field.setInputType(input); field.setSelectAllOnFocus(false);
        field.setPadding(dp(12), dp(10), dp(12), dp(10)); field.setBackground(shape(0xFFFAFBF7, 10, LINE));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(49)); lp.topMargin = dp(7); parent.addView(field, lp); return field;
    }
    private CheckBox check(String label, boolean checked) { CheckBox box = new CheckBox(this); box.setText(label); box.setTextColor(INK); box.setTextSize(13); box.setChecked(checked); box.setButtonTintList(ColorStateList.valueOf(GREEN)); return box; }
    private LinearLayout column() { LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); return layout; }
    private LinearLayout row() { LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.HORIZONTAL); return layout; }
    private LinearLayout card(int color) { LinearLayout layout = column(); layout.setPadding(dp(20), dp(20), dp(20), dp(18)); layout.setBackground(shape(color, 20, color == Color.WHITE ? LINE : 0)); return layout; }
    private TextView text(String value, int size, int color, boolean bold) { TextView text = new TextView(this); text.setText(value); text.setTextSize(size); text.setTextColor(color); text.setLineSpacing(dp(2), 1); text.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL)); return text; }
    private Button button(String label, int background, int color) { Button button = new Button(this); button.setText(label); button.setTextSize(15); button.setAllCaps(false); button.setTextColor(color); button.setTypeface(Typeface.DEFAULT, Typeface.BOLD); button.setMinHeight(dp(48)); button.setMinimumHeight(dp(48)); button.setPadding(dp(12), dp(4), dp(12), dp(4)); button.setStateListAnimator(null); button.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(0x22285A43), shape(background, 14, 0), null)); return button; }
    private GradientDrawable shape(int color, int radius, int stroke) { GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(radius)); if (stroke != 0) drawable.setStroke(dp(1), stroke); return drawable; }
    private void margin(LinearLayout parent, View child, int top) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(top); parent.addView(child, params); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
