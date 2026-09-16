import SwiftUI
import AppKit
import Security
import CropsCore

enum SessionKeychain {
    static let service = "com.crops.timetracker.session"
    static func read(server: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: server, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func write(_ token: String, server: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: server]
        let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8)]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query.merging(attributes) { _, new in new }
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let added = SecItemAdd(item as CFDictionary, nil)
            guard added == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(added), userInfo: [NSLocalizedDescriptionKey: "Your Mac couldn't save the session in Keychain. Unlock Keychain and try again."]) }
        } else if status != errSecSuccess {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Your Mac couldn't update the session in Keychain."])
        }
    }
    static func remove(server: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: server] as CFDictionary)
    }
}

@MainActor final class CropsStore: ObservableObject {
    @Published var state: AppState?
    @Published var signedIn = false
    @Published var busy = false
    @Published var refreshing = false
    @Published var error: String?
    @Published var now = Date()
    @Published var lastSync: Date?
    @Published var serverAddress: String
    @Published var selectedProject = ""
    @Published var task = ""
    @Published var notes = ""
    @Published var billable = true
    @Published var selectedDay = Calendar.current.startOfDay(for: Date())
    private var api: APIClient?
    private var clockTimer: Timer?
    private var syncTask: Task<Void, Never>?
    private var generation = 0
    private var selectedTeamId: String?
    private var serverOffset: TimeInterval = 0
    private var uncertainMutation: (path: String, fingerprint: Data, key: String)?
    private var observers: [NSObjectProtocol] = []

    init() {
        let savedOrigin = UserDefaults.standard.string(forKey: "serverAddress")
        let migrating = CropsServer.needsMigration(savedOrigin)
        serverAddress = CropsServer.resolvedOrigin(savedOrigin)
        if migrating {
            // Never copy an old origin's credential to another origin. Reauthenticate there.
            SessionKeychain.remove(server: CropsServer.previousProductionOrigin)
            UserDefaults.standard.set(serverAddress, forKey: "serverAddress")
            UserDefaults.standard.removeObject(forKey: "selectedTeamId")
            selectedTeamId = nil
        } else {
            selectedTeamId = UserDefaults.standard.string(forKey: "selectedTeamId")
        }
        if let token = SessionKeychain.read(server: serverAddress), let client = try? APIClient(address: serverAddress, token: token) {
            api = client
            signedIn = true
        }
        clockTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in self?.now = Date() } }
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in await self?.sync() } })
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in await self?.sync() } })
        syncTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.sync()
                let delay: UInt64 = self?.state?.runningEntry == nil ? 15 : 5
                try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
            }
        }
    }

    var activeProjects: [Project] { state?.projects.filter { $0.archived != true } ?? [] }
    var dayEntries: [Entry] {
        guard let state else { return [] }
        return state.entries.filter { $0.userId == state.user.id && $0.date == CropsTime.dateKey(selectedDay) }.sorted { lhs, rhs in
            if (lhs.startedAt != nil) != (rhs.startedAt != nil) { return lhs.startedAt != nil }
            return false // Preserve the API's newest-first ordering within the day.
        }
    }
    var dayTotal: TimeInterval { dayEntries.reduce(0) { $0 + elapsed($1) } }
    var menuTitle: String { state?.runningEntry.map { CropsTime.clock(elapsed($0), seconds: false) } ?? "" }
    var healthy: Bool { error == nil && (lastSync.map { Date().timeIntervalSince($0) < 45 } ?? false) }
    func elapsed(_ entry: Entry) -> TimeInterval { entry.elapsed(at: now, serverOffset: serverOffset) }
    func project(_ id: String) -> Project? { state?.projects.first { $0.id == id } }
    func clientName(_ projectId: String) -> String? {
        guard let clientId = project(projectId)?.clientId else { return nil }
        return state?.clients.first { $0.id == clientId }?.name
    }
    func dayTotal(_ date: Date) -> TimeInterval {
        guard let state else { return 0 }
        return state.entries.filter { $0.userId == state.user.id && $0.date == CropsTime.dateKey(date) }.reduce(0) { $0 + elapsed($1) }
    }
    func sync() async {
        guard signedIn, !busy, !refreshing, let api else { return }
        refreshing = true
        let captured = generation
        defer { refreshing = false }
        do {
            let value = try await api.state(teamId: selectedTeamId)
            guard captured == generation else { return }
            accept(value)
        } catch {
            guard captured == generation else { return }
            // A removed team can no longer be selected; discover current memberships.
            if case APIError.server(403, _) = error, selectedTeamId != nil {
                selectedTeamId = nil
                do { let value = try await api.state(); guard captured == generation else { return }; accept(value); return } catch { handle(error) }
            } else { handle(error) }
        }
    }
    private func accept(_ value: AppState) {
        state = value
        selectedTeamId = value.team.id
        UserDefaults.standard.set(value.team.id, forKey: "selectedTeamId")
        if let date = CropsTime.parseISO(value.serverTime) { serverOffset = date.timeIntervalSinceNow }
        now = Date()
        lastSync = now
        error = nil
        if !activeProjects.contains(where: { $0.id == selectedProject }) { selectProject(activeProjects.first?.id ?? "") }
    }
    func selectProject(_ id: String) { selectedProject = id; billable = project(id)?.billable ?? true }
    private func handle(_ issue: Error) {
        if let issue = issue as? APIError, issue.isUnauthorized {
            clearSession()
            error = "Your session expired. Sign in again to continue."
        } else if let issue = issue as? URLError {
            let suffix = state?.runningEntry != nil ? " Your running timer continues." : ""
            error = issue.code == .notConnectedToInternet ? "You're offline.\(suffix) Reconnect to make changes." : "Can't reach your Crops server.\(suffix) Try syncing again."
        } else { error = issue.localizedDescription }
    }
    func authenticate(address: String, username: String, password: String, name: String?, teamName: String?) async {
        guard !busy else { return }
        busy = true; error = nil; generation += 1
        defer { busy = false }
        do {
            let client = try APIClient(address: address)
            var body: [String: Any] = ["username": username.trimmingCharacters(in: .whitespacesAndNewlines), "password": password]
            let path: String
            if let name, let teamName { body["name"] = name; body["teamName"] = teamName; path = "/api/auth/register" }
            else { path = "/api/auth/login" }
            let auth = try await client.decode(AuthResponse.self, method: "POST", path: path, body: body)
            let normalized = client.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            try SessionKeychain.write(auth.token, server: normalized)
            serverAddress = normalized
            UserDefaults.standard.set(normalized, forKey: "serverAddress")
            client.token = auth.token
            api = client; signedIn = true; selectedTeamId = nil
            accept(try await client.state())
        } catch { handle(error) }
    }
    func switchTeam(_ id: String) async {
        guard !busy, let api, id != state?.team.id else { return }
        busy = true; generation += 1
        defer { busy = false }
        do { accept(try await api.state(teamId: id)); task = ""; notes = ""; selectProject(activeProjects.first?.id ?? "") }
        catch { handle(error) }
    }
    func start(entry: Entry? = nil) async {
        guard let team = state?.team else { return }
        var body: [String: Any] = ["teamId": entry?.teamId ?? team.id, "projectId": entry?.projectId ?? selectedProject, "task": entry?.task ?? task.trimmingCharacters(in: .whitespacesAndNewlines), "notes": entry?.notes ?? notes, "billable": entry?.billable ?? billable]
        if let entry { body["entryId"] = entry.id }
        else { body["date"] = CropsTime.dateKey(Date()) }
        await mutate(path: "/api/timer/start", body: body)
    }
    func stop(entry displayedEntry: Entry? = nil) async {
        guard let entry = displayedEntry ?? state?.runningEntry else { return }
        await mutate(path: "/api/timer/stop", body: ["entryId": entry.id, "version": entry.version])
    }
    func addManual(date: Date, duration: String) async -> Bool {
        guard let seconds = CropsTime.parseDuration(duration), let team = state?.team else { error = "Enter a duration such as 1:30 or 1.5 (up to 24 hours)."; return false }
        return await mutate(path: "/api/entries", body: ["teamId": team.id, "projectId": selectedProject, "task": task.trimmingCharacters(in: .whitespacesAndNewlines), "notes": notes, "date": CropsTime.dateKey(date), "durationSeconds": seconds, "billable": billable])
    }
    @discardableResult private func mutate(path: String, body: [String: Any]) async -> Bool {
        guard !busy, let api else { return false }
        busy = true; error = nil; generation += 1
        defer { busy = false }
        let fingerprint = (try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])) ?? Data()
        let key = uncertainMutation.flatMap { $0.path == path && $0.fingerprint == fingerprint ? $0.key : nil } ?? UUID().uuidString
        uncertainMutation = (path, fingerprint, key)
        do {
            _ = try await api.request("POST", path: path, body: body, idempotencyKey: key)
            uncertainMutation = nil
            do { accept(try await api.state(teamId: selectedTeamId)) }
            catch { handle(error); self.error = "Your change was saved. Couldn't refresh the timesheet; sync again when connected." }
            return true
        } catch {
            if error is APIError { uncertainMutation = nil }
            handle(error)
            // If a response was lost, refetch canonical state instead of retrying a mutation.
            if signedIn, let value = try? await api.state(teamId: selectedTeamId) { let message = self.error; accept(value); self.error = message }
            return false
        }
    }
    func logout() async {
        guard !busy else { return }
        busy = true; generation += 1
        let client = api
        _ = try? await client?.request("POST", path: "/api/auth/logout", body: [:])
        clearSession(); busy = false
    }
    private func clearSession() {
        generation += 1
        SessionKeychain.remove(server: serverAddress)
        api = nil; state = nil; signedIn = false; lastSync = nil; selectedTeamId = nil
        selectedProject = ""; task = ""; notes = ""; error = nil
        uncertainMutation = nil
        UserDefaults.standard.removeObject(forKey: "selectedTeamId")
    }
    func openWeb() {
        guard var components = URLComponents(string: serverAddress) else { return }
        // Vite serves the management interface separately during local development.
        if components.port == 8787 && ["127.0.0.1", "localhost"].contains(components.host ?? "") { components.port = 5173 }
        if let url = components.url { NSWorkspace.shared.open(url) }
    }
}
