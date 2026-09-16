import SwiftUI
import AppKit
import CropsCore

enum Palette {
    static let forest = Color(red: 0.15, green: 0.29, blue: 0.22)
    static let mint = Color(red: 0.82, green: 0.90, blue: 0.71)
    static let background = adaptive(light: NSColor(red: 0.97, green: 0.965, blue: 0.94, alpha: 1), dark: NSColor(red: 0.11, green: 0.14, blue: 0.12, alpha: 1))
    static let surface = adaptive(light: .white, dark: NSColor(red: 0.16, green: 0.19, blue: 0.17, alpha: 1))
    static let ink = adaptive(light: NSColor(red: 0.17, green: 0.22, blue: 0.18, alpha: 1), dark: NSColor(red: 0.93, green: 0.94, blue: 0.9, alpha: 1))
    static let accent = adaptive(light: NSColor(red: 0.22, green: 0.38, blue: 0.28, alpha: 1), dark: NSColor(red: 0.7, green: 0.84, blue: 0.58, alpha: 1))
    private static func adaptive(light: NSColor, dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light })
    }
    static func hex(_ string: String) -> Color {
        let value = UInt64(string.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x58735D
        return Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 13, weight: .semibold))
            .frame(maxWidth: .infinity).frame(height: 38)
            .foregroundStyle(.white).background(Palette.forest.opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4), in: RoundedRectangle(cornerRadius: 9))
    }
}

struct RootView: View {
    @EnvironmentObject var store: CropsStore
    @Environment(\.openWindow) private var openWindow
    var isPopover = false
    @State private var showSettings = false
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 9) {
                Image(systemName: "leaf.fill").font(.system(size: 24, weight: .medium)).foregroundStyle(Palette.accent)
                Text("crops").font(.system(size: 25, weight: .semibold, design: .rounded)).tracking(-1)
                Spacer()
                if store.signedIn {
                    Menu {
                        ForEach(store.state?.teams ?? []) { team in
                            Button { Task { await store.switchTeam(team.id) } } label: {
                                if team.id == store.state?.team.id { Label(team.name, systemImage: "checkmark") } else { Text(team.name) }
                            }
                        }
                        Divider()
                        Button("Manage teams in web app") { store.openWeb() }
                    } label: {
                        Text(store.state?.team.name ?? "Your team").font(.system(size: 11, weight: .medium)).lineLimit(1).frame(maxWidth: 150)
                    }.menuStyle(.borderlessButton).fixedSize(horizontal: false, vertical: true).disabled(store.busy)
                }
                Button { showSettings.toggle() } label: { Image(systemName: showSettings ? "xmark" : "gearshape").font(.system(size: 15)).frame(width: 28, height: 28) }
                    .buttonStyle(.plain).help(showSettings ? "Close settings" : "Settings").accessibilityLabel(showSettings ? "Close settings" : "Settings")
            }.padding(.horizontal, 24).padding(.top, isPopover ? 20 : 30).padding(.bottom, 20)

            if showSettings { SettingsView(close: { showSettings = false }) }
            else if !store.signedIn { LoginView() }
            else if store.state == nil {
                VStack(spacing: 16) {
                    ProgressView().controlSize(.large)
                    Text("Gathering your time…").font(.headline)
                    ErrorBanner()
                    Button("Try again") { Task { await store.sync() } }.disabled(store.refreshing)
                }.padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else { TrackerView() }

            Divider().opacity(0.45)
            HStack(spacing: 6) {
                if store.signedIn {
                    Circle().fill(store.healthy ? Palette.accent : Color.orange).frame(width: 5, height: 5)
                    Text(store.error != nil ? "Needs attention" : store.healthy ? "All changes saved" : "Waiting to sync").font(.system(size: 10))
                    Button { Task { await store.sync() } } label: { Image(systemName: "arrow.clockwise").font(.system(size: 10)) }
                        .buttonStyle(.plain).help("Sync now").accessibilityLabel("Sync now").disabled(store.refreshing || store.busy)
                } else { Text("A little time. A lot of growth.").font(.system(size: 10)) }
                Spacer()
                if isPopover {
                    Button { openWindow(id: "crops"); NSApp.activate(ignoringOtherApps: true) } label: { Image(systemName: "macwindow").font(.system(size: 12)) }.buttonStyle(.plain).help("Open Crops window").accessibilityLabel("Open Crops window")
                }
                Button { store.openWeb() } label: { Label("Open web", systemImage: "arrow.up.right").font(.system(size: 10, weight: .medium)) }.buttonStyle(.plain)
            }.foregroundStyle(.secondary).padding(.horizontal, 24).padding(.vertical, 14)
        }
        .foregroundStyle(Palette.ink).background(Palette.background).tint(Palette.accent)
        .task { await store.sync() }
    }
}

struct ErrorBanner: View {
    @EnvironmentObject var store: CropsStore
    var body: some View {
        if let error = store.error {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.circle").foregroundStyle(.orange)
                Text(error).font(.system(size: 11)).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Button { store.error = nil } label: { Image(systemName: "xmark").font(.system(size: 9)) }.buttonStyle(.plain).accessibilityLabel("Dismiss error")
            }.padding(10).background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
        }
    }
}

struct InputField: View {
    let label: String
    var placeholder = ""
    @Binding var text: String
    var secure = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            Group {
                if secure { SecureField(placeholder, text: $text) }
                else { TextField(placeholder, text: $text) }
            }.textFieldStyle(.plain).font(.system(size: 13)).padding(10)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.ink.opacity(0.12), lineWidth: 1))
                .accessibilityLabel(label)
        }
    }
}

struct LoginView: View {
    @EnvironmentObject var store: CropsStore
    @State private var username = ""
    @State private var password = ""
    @State private var name = ""
    @State private var teamName = ""
    @State private var address = ""
    @State private var registering = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 9) {
                    Text(registering ? "Room to grow." : "Make time for\ngood work.").font(.system(size: 34, weight: .medium, design: .serif)).tracking(-0.7)
                    Text(registering ? "Create your account and your first team." : "Your projects, your team, your time.\nTogether in one quiet corner of your Mac.").font(.system(size: 12)).foregroundStyle(.secondary).lineSpacing(4)
                }.padding(.bottom, 8)
                ErrorBanner()
                InputField(label: "Crops server", placeholder: "https://crops.yourteam.com", text: $address)
                if registering {
                    HStack(alignment: .top, spacing: 10) {
                        InputField(label: "Your name", placeholder: "Alex", text: $name)
                        InputField(label: "Team name", placeholder: "Acme Studio", text: $teamName)
                    }
                }
                InputField(label: "Username", placeholder: "your.username", text: $username)
                InputField(label: "Password", placeholder: registering ? "At least 8 characters" : "Your password", text: $password, secure: true)
                Button {
                    Task { await store.authenticate(address: address, username: username, password: password, name: registering ? name : nil, teamName: registering ? teamName : nil); if store.signedIn { password = "" } }
                } label: {
                    HStack { if store.busy { ProgressView().controlSize(.small).tint(.white) }; Text(store.busy ? "Connecting…" : registering ? "Create your workspace" : "Sign in"); if !store.busy { Image(systemName: "arrow.right") } }
                }.buttonStyle(PrimaryButtonStyle()).disabled(store.busy || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty || (registering && (name.isEmpty || teamName.isEmpty)))
                    .keyboardShortcut(.defaultAction)
                Button(registering ? "Already have an account? Sign in" : "New here? Create a workspace") { registering.toggle(); store.error = nil }.buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(Palette.accent).frame(maxWidth: .infinity)
                Text("Use the same server and account on every device.").font(.system(size: 10)).foregroundStyle(.tertiary).frame(maxWidth: .infinity).padding(.top, 4)
            }.padding(.horizontal, 28).padding(.top, 8).padding(.bottom, 24)
        }.onAppear { address = store.serverAddress }
    }
}

struct TrackerView: View {
    @EnvironmentObject var store: CropsStore
    @State private var showComposer = false
    @State private var manual = false
    @State private var duration = ""
    @State private var manualDate = Date()
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ErrorBanner()
                if showComposer { composer }
                else {
                    HStack {
                        Label(store.state?.runningEntry == nil ? "No timer running" : "Timer running", systemImage: store.state?.runningEntry == nil ? "pause.circle" : "play.circle.fill")
                            .font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                        Spacer()
                        Button {
                            manual = false; duration = ""; manualDate = min(store.selectedDay, Date())
                            store.task = ""; store.notes = ""; showComposer = true
                        } label: { Label("New entry", systemImage: "plus").font(.system(size: 11, weight: .semibold)) }
                            .buttonStyle(.bordered).disabled(store.busy).keyboardShortcut("n")
                            .accessibilityLabel("New entry")
                    }
                    if let running = store.state?.runningEntry { runningCard(running) }
                    WeekStrip()
                    HStack(alignment: .firstTextBaseline) {
                        Text(Calendar.current.isDateInToday(store.selectedDay) ? "Today’s time" : store.selectedDay.formatted(.dateTime.month(.abbreviated).day())).font(.system(size: 17, weight: .medium, design: .serif))
                        Spacer()
                        Text(CropsTime.clock(store.dayTotal, seconds: false)).font(.system(size: 16, weight: .semibold)).monospacedDigit()
                    }.padding(.top, 5)
                    if store.dayEntries.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "sun.horizon").font(.system(size: 25, weight: .light)).foregroundStyle(Palette.accent)
                            Text("A fresh start.").font(.system(size: 13, weight: .medium))
                            Text("The time you track will appear here.").font(.system(size: 11)).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity).padding(.vertical, 26)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(store.dayEntries) { entry in
                                EntryRow(entry: entry)
                                if entry.id != store.dayEntries.last?.id { Divider().padding(.leading, 25).opacity(0.5) }
                            }
                        }.padding(.horizontal, 12).background(Palette.surface, in: RoundedRectangle(cornerRadius: 12))
                    }
                    if store.state?.runningEntry != nil {
                        Text("Your timer keeps running when this window closes.").font(.system(size: 10)).foregroundStyle(.tertiary).frame(maxWidth: .infinity)
                    }
                }
            }.padding(.horizontal, 24).padding(.bottom, 22)
        }.onChange(of: store.state?.team.id) { _ in showComposer = false }
    }
    private func runningCard(_ entry: Entry) -> some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack {
                Circle().fill(Palette.mint).frame(width: 6, height: 6)
                Text("TIMER RUNNING").font(.system(size: 9, weight: .semibold)).tracking(1.5)
                Spacer()
                Image(systemName: "waveform.path").foregroundStyle(Palette.mint)
            }.foregroundStyle(Palette.mint)
            Text(CropsTime.clock(store.elapsed(entry))).font(.system(size: 43, weight: .light, design: .rounded)).monospacedDigit().tracking(-1)
            VStack(alignment: .leading, spacing: 5) {
                Text(store.project(entry.projectId)?.name ?? "Project on another team").font(.system(size: 14, weight: .semibold)).lineLimit(2)
                Text(entry.task.isEmpty ? "Focused work" : entry.task).font(.system(size: 12)).foregroundStyle(.white.opacity(0.75)).lineLimit(2)
                if !entry.notes.isEmpty { Text(entry.notes).font(.system(size: 11)).foregroundStyle(.white.opacity(0.6)).lineLimit(2) }
                if let client = store.clientName(entry.projectId) { Text(client).font(.system(size: 10)).foregroundStyle(Palette.mint.opacity(0.8)) }
                if entry.teamId != store.state?.team.id, let team = store.state?.teams.first(where: { $0.id == entry.teamId }) {
                    Button("Switch to \(team.name)") { Task { await store.switchTeam(team.id) } }
                        .buttonStyle(.plain).font(.system(size: 11, weight: .medium)).foregroundStyle(Palette.mint).disabled(store.busy)
                }
            }
            Button { Task { await store.stop(entry: entry) } } label: {
                HStack(spacing: 8) { Image(systemName: "stop.fill").font(.system(size: 9)); Text(store.busy ? "Saving…" : "Stop timer").font(.system(size: 12, weight: .semibold)) }.frame(maxWidth: .infinity).frame(height: 36)
                    .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.white.opacity(0.16)))
            }.buttonStyle(.plain).disabled(store.busy).keyboardShortcut(".")
        }.foregroundStyle(.white).padding(20).background(Palette.forest, in: RoundedRectangle(cornerRadius: 14))
    }
    private var composer: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Button { showComposer = false } label: { Label("Back", systemImage: "chevron.left") }
                    .buttonStyle(.plain).font(.system(size: 11, weight: .medium)).disabled(store.busy)
                    .keyboardShortcut(.cancelAction).accessibilityLabel("Cancel new entry")
                Spacer()
                Text("NEW ENTRY").font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(.secondary)
            }.padding(.bottom, 6)
            Picker("Entry type", selection: $manual) {
                Text("Timer").tag(false)
                Text("Manual time").tag(true)
            }.pickerStyle(.segmented).labelsHidden().disabled(store.busy)
            HStack {
                Text(manual ? "Add a little time." : "What are you working on?").font(.system(size: 18, weight: .medium, design: .serif))
                Spacer()
            }
            if store.activeProjects.isEmpty {
                Text("Your team is ready. Add a project in the web app to start tracking.").font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Button("Add your first project") { store.openWeb() }.buttonStyle(PrimaryButtonStyle())
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Project").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                    Picker("Project", selection: Binding(get: { store.selectedProject }, set: { store.selectProject($0) })) {
                        ForEach(store.activeProjects) { project in
                            Text((store.clientName(project.id).map { "\($0) · " } ?? "") + project.name).tag(project.id)
                        }
                    }.labelsHidden().pickerStyle(.menu).controlSize(.large).frame(maxWidth: .infinity).accessibilityLabel("Project")
                }
                InputField(label: "Task", placeholder: "Design, development, a good idea…", text: $store.task)
                InputField(label: "Notes · optional", placeholder: "A few details for later", text: $store.notes)
                if manual {
                    HStack(alignment: .bottom, spacing: 12) {
                        InputField(label: "Duration (hours)", placeholder: "1:30 or 1.5", text: $duration)
                        DatePicker("Date", selection: $manualDate, in: ...Date(), displayedComponents: .date).datePickerStyle(.field).font(.system(size: 11)).frame(width: 155).padding(.bottom, 9)
                    }
                }
                Toggle("Billable", isOn: $store.billable).toggleStyle(.checkbox).font(.system(size: 11))
                if !manual && store.state?.runningEntry != nil {
                    Text("Starting a new timer will stop your current timer and save its time.").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Button {
                    Task {
                        if manual {
                            if await store.addManual(date: manualDate, duration: duration) {
                                store.selectedDay = Calendar.current.startOfDay(for: manualDate); showComposer = false
                            }
                        } else if await store.start() {
                            store.selectedDay = Calendar.current.startOfDay(for: Date()); showComposer = false
                        }
                    }
                } label: { HStack { Image(systemName: manual ? "plus" : "play.fill").font(.system(size: 10)); Text(store.busy ? "Saving…" : manual ? "Save time" : "Start timer") } }
                    .buttonStyle(PrimaryButtonStyle()).disabled(store.busy || store.selectedProject.isEmpty || (manual && CropsTime.parseDuration(duration) == nil))
                    .keyboardShortcut(.defaultAction)
            }
        }
    }
}

struct WeekStrip: View {
    @EnvironmentObject var store: CropsStore
    private var days: [Date] {
        var calendar = Calendar.current; calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: store.selectedDay)?.start ?? store.selectedDay
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }
    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text(store.selectedDay.formatted(.dateTime.month(.wide).year())).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                Spacer()
                if !Calendar.current.isDateInToday(store.selectedDay) { Button("Today") { store.selectedDay = Calendar.current.startOfDay(for: Date()) }.buttonStyle(.plain).font(.system(size: 10)).foregroundStyle(Palette.accent) }
                Button { moveWeek(-1) } label: { Image(systemName: "chevron.left").font(.system(size: 10, weight: .semibold)).frame(width: 22, height: 22) }.buttonStyle(.plain).accessibilityLabel("Previous week")
                Button { moveWeek(1) } label: { Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).frame(width: 22, height: 22) }.buttonStyle(.plain).accessibilityLabel("Next week")
            }
            HStack(spacing: 4) {
                ForEach(days, id: \.self) { day in
                    let selected = Calendar.current.isDate(day, inSameDayAs: store.selectedDay)
                    Button { store.selectedDay = day } label: {
                        VStack(spacing: 7) {
                            Text(day.formatted(.dateTime.weekday(.narrow))).font(.system(size: 10, weight: .medium)).opacity(0.7)
                            Text(day.formatted(.dateTime.day())).font(.system(size: 14, weight: selected ? .semibold : .regular))
                            Text(CropsTime.clock(store.dayTotal(day), seconds: false)).font(.system(size: 9)).monospacedDigit().opacity(0.7)
                        }.frame(maxWidth: .infinity).padding(.vertical, 10).foregroundStyle(selected ? .white : Palette.ink)
                            .background(selected ? Palette.forest : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                    }.buttonStyle(.plain).accessibilityLabel(day.formatted(.dateTime.weekday(.wide).month().day()) + ", " + CropsTime.clock(store.dayTotal(day), seconds: false))
                }
            }
        }
    }
    private func moveWeek(_ direction: Int) {
        if let date = Calendar.current.date(byAdding: .day, value: direction * 7, to: store.selectedDay) { store.selectedDay = date }
    }
}

struct EntryRow: View {
    @EnvironmentObject var store: CropsStore
    let entry: Entry
    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(Palette.hex(store.project(entry.projectId)?.color ?? "#58735D")).frame(width: 3, height: 35)
            VStack(alignment: .leading, spacing: 4) {
                Text(store.project(entry.projectId)?.name ?? "Project").font(.system(size: 12, weight: .medium)).lineLimit(1)
                Text(entry.task.isEmpty ? "Focused work" : entry.task).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                if !entry.notes.isEmpty { Text(entry.notes).font(.system(size: 10)).foregroundStyle(.tertiary).lineLimit(1) }
                if entry.status != "unbilled" { Text(entry.status.capitalized).font(.system(size: 9, weight: .medium)).foregroundStyle(Palette.accent) }
            }
            Spacer(minLength: 2)
            Text(CropsTime.clock(store.elapsed(entry), seconds: false)).font(.system(size: 14, weight: .medium)).monospacedDigit()
            if entry.startedAt != nil {
                Image(systemName: "waveform.path").font(.system(size: 13)).foregroundStyle(Palette.accent).frame(width: 25, height: 28).accessibilityLabel("Running")
            } else if entry.status == "unbilled" && store.project(entry.projectId)?.archived != true {
                Button { Task { await store.start(entry: entry) } } label: { Image(systemName: "play.circle").font(.system(size: 21, weight: .ultraLight)).frame(width: 25, height: 28) }.buttonStyle(.plain).foregroundStyle(Palette.accent).help("Resume this entry").accessibilityLabel("Resume \(entry.task.isEmpty ? "entry" : entry.task)").disabled(store.busy)
            } else { Image(systemName: "checkmark.circle").foregroundStyle(.tertiary).frame(width: 25, height: 28) }
        }.padding(.vertical, 14)
    }
}

struct SettingsView: View {
    @EnvironmentObject var store: CropsStore
    @State private var confirmingLogout = false
    let close: () -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Your quiet corner.").font(.system(size: 25, weight: .medium, design: .serif))
                if let user = store.state?.user {
                    VStack(alignment: .leading, spacing: 6) { Text(user.name).font(.headline); Text("@\(user.username)").font(.system(size: 12)).foregroundStyle(.secondary) }
                }
                VStack(alignment: .leading, spacing: 7) {
                    Text("CONNECTED TO").font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(.secondary)
                    Text(store.serverAddress).font(.system(size: 12)).textSelection(.enabled)
                    if let last = store.lastSync { Text("Last sync: \(last.formatted(.dateTime.hour().minute().second()))").font(.system(size: 10)).foregroundStyle(.secondary) }
                }
                ErrorBanner()
                if store.signedIn {
                    Button("Sync now") { Task { await store.sync() } }.disabled(store.busy || store.refreshing)
                    Divider()
                    Text("Your timer syncs every 5 seconds while running, and every 15 seconds when idle. It also refreshes when your Mac wakes.").font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Text("To use another server, sign out first. Your session is kept securely in macOS Keychain.").font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Button("Sign out") { confirmingLogout = true }.disabled(store.busy)
                }
                Divider()
                HStack { VStack(alignment: .leading, spacing: 4) { Text("Crops for Mac").font(.system(size: 12, weight: .medium)); Text("Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.1.0") · Made for focused work").font(.system(size: 10)).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "leaf").font(.title2).foregroundStyle(Palette.accent) }
                Button("Quit Crops") { NSApp.terminate(nil) }
                Text("Quitting leaves your server timer running. Stop it first when you’re done for the day.").font(.system(size: 10)).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
            }.padding(.horizontal, 24).padding(.bottom, 24)
        }.confirmationDialog("Sign out of Crops?", isPresented: $confirmingLogout, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await store.logout(); close() } }
            Button("Cancel", role: .cancel) {}
        } message: { Text(store.state?.runningEntry == nil ? "You can sign back in with your username and password." : "Your timer will keep running. You can stop it from another device or sign back in.") }
    }
}
