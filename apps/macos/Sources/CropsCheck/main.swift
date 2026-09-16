import Foundation
import CropsCore

@main struct CropsCheck {
    static func main() async {
        do {
            let env = ProcessInfo.processInfo.environment
            guard let address = env["CROPS_SMOKE_URL"], let username = env["CROPS_SMOKE_USER"], let password = env["CROPS_SMOKE_PASSWORD"] else {
                print("Set CROPS_SMOKE_URL, CROPS_SMOKE_USER, and CROPS_SMOKE_PASSWORD to a disposable test account. This check creates a 60-second entry, starts, stops, and resumes a timer.")
                exit(2)
            }
            let api = try APIClient(address: address)
            let auth = try await api.decode(AuthResponse.self, method: "POST", path: "/api/auth/login", body: ["username": username, "password": password])
            api.token = auth.token
            let initial = try await api.state()
            let unchanged = try await api.state()
            guard unchanged.user.id == initial.user.id && unchanged.entries.count == initial.entries.count else { throw CheckError.message("Conditional state sync changed the snapshot.") }
            guard initial.runningEntry == nil else { throw CheckError.message("Test account already has a running timer; stop it before testing.") }
            guard let project = initial.projects.first(where: { $0.archived != true }) else { throw CheckError.message("Create a project in the test account before running this check.") }
            let marker = "macOS integration check \(UUID().uuidString.prefix(8))"
            let manualBody: [String: Any] = ["teamId": initial.team.id, "projectId": project.id, "task": marker, "notes": "Created by CropsCheck", "date": CropsTime.dateKey(Date()), "durationSeconds": 60, "billable": true]
            let requestKey = UUID().uuidString
            _ = try await api.request("POST", path: "/api/entries", body: manualBody, idempotencyKey: requestKey)
            _ = try await api.request("POST", path: "/api/entries", body: manualBody, idempotencyKey: requestKey)
            let manual = try await api.state()
            guard manual.entries.filter({ $0.task == marker && $0.durationSeconds == 60 }).count == 1 else { throw CheckError.message("Manual entry was not persisted exactly once.") }
            _ = try await api.request("POST", path: "/api/timer/start", body: ["teamId": initial.team.id, "projectId": project.id, "task": marker + " timer", "notes": "", "billable": true])
            let running = try await api.state()
            guard let entry = running.runningEntry, entry.startedAt != nil else { throw CheckError.message("Timer did not start.") }
            try await Task.sleep(nanoseconds: 1_100_000_000)
            _ = try await api.request("POST", path: "/api/timer/stop", body: ["entryId": entry.id, "version": entry.version])
            let stopped = try await api.state()
            guard stopped.runningEntry == nil, let saved = stopped.entries.first(where: { $0.id == entry.id }), saved.durationSeconds >= 1 else { throw CheckError.message("Timer stop did not persist elapsed time.") }
            _ = try await api.request("POST", path: "/api/timer/start", body: ["teamId": initial.team.id, "projectId": project.id, "entryId": entry.id, "task": entry.task, "notes": "", "billable": true])
            let resumed = try await api.state()
            guard let resumedEntry = resumed.runningEntry, resumedEntry.id == entry.id else { throw CheckError.message("Resume created a different entry.") }
            do {
                _ = try await api.request("POST", path: "/api/timer/stop", body: ["entryId": entry.id, "version": entry.version])
                throw CheckError.message("A stale stop unexpectedly stopped a newer timer session.")
            } catch APIError.server(409, _) {}
            let afterStaleStop = try await api.state()
            guard afterStaleStop.runningEntry?.id == entry.id else { throw CheckError.message("Stale stop changed the current timer.") }
            _ = try await api.request("POST", path: "/api/timer/stop", body: ["entryId": entry.id, "version": resumedEntry.version])
            _ = try await api.request("POST", path: "/api/auth/logout", body: [:])
            print("PASS: native API login, conditional state sync, idempotent manual time, start, elapsed persistence, stop, resume, stale-stop protection, and logout.")
        } catch {
            fputs("FAIL: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
    enum CheckError: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let message) = self { return message }; return nil }
    }
}
