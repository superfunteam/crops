import Foundation
import CropsCore

@main struct CropsCheck {
    static func main() async {
        do {
            let env = ProcessInfo.processInfo.environment
            guard let address = env["CROPS_SMOKE_URL"], let username = env["CROPS_SMOKE_USER"], let password = env["CROPS_SMOKE_PASSWORD"] else {
                print("Set CROPS_SMOKE_URL, CROPS_SMOKE_USER, and CROPS_SMOKE_PASSWORD to a disposable test account. This check creates, edits, and deletes a 60-second entry, then starts, edits, stops, resumes, and deletes a timer entry.")
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
            let manualBody: [String: Any] = ["teamId": initial.team.id, "projectId": project.id, "task": marker, "notes": "Created by CropsCheck", "date": CropsTime.dateKey(Date()), "durationSeconds": 60, "billable": true, "agent": ["tokens": 2410000, "cost": 31.4, "model": "claude-opus-5"]]
            let requestKey = UUID().uuidString
            _ = try await api.request("POST", path: "/api/entries", body: manualBody, idempotencyKey: requestKey)
            _ = try await api.request("POST", path: "/api/entries", body: manualBody, idempotencyKey: requestKey)
            let manual = try await api.state()
            guard manual.entries.filter({ $0.task == marker && $0.durationSeconds == 60 }).count == 1, let created = manual.entries.first(where: { $0.task == marker }) else { throw CheckError.message("Manual entry was not persisted exactly once.") }
            guard created.agent?.label == "2.41M tokens · $31.40" else { throw CheckError.message("Agent usage did not decode from state.") }
            var draft = EntryDraft(entry: created)
            draft.task = marker + " edited"; draft.duration = "1:30:15"; draft.notes = "Edited by CropsCheck"
            guard let patch = try draft.patchBody(for: created) else { throw CheckError.message("Edit produced no changes.") }
            _ = try await api.request("PATCH", path: EntryDraft.path(for: created), body: patch)
            let edited = try await api.state()
            guard let saved = edited.entries.first(where: { $0.id == created.id }), saved.task == marker + " edited", saved.durationSeconds == 5415, saved.notes == "Edited by CropsCheck", saved.version > created.version else { throw CheckError.message("Entry edit did not persist.") }
            do { _ = try await api.request("PATCH", path: EntryDraft.path(for: created), body: patch); throw CheckError.message("A stale edit was accepted.") } catch APIError.server(409, _) {}
            do { _ = try await api.request("DELETE", path: EntryDraft.deletePath(for: created)); throw CheckError.message("A stale delete was accepted.") } catch APIError.server(409, _) {}
            _ = try await api.request("DELETE", path: EntryDraft.deletePath(for: saved))
            guard try await api.state().entries.contains(where: { $0.id == created.id }) == false else { throw CheckError.message("Entry delete did not persist.") }
            _ = try await api.request("POST", path: "/api/timer/start", body: ["teamId": initial.team.id, "projectId": project.id, "task": marker + " timer", "notes": "", "billable": true])
            let running = try await api.state()
            guard let entry = running.runningEntry, entry.startedAt != nil else { throw CheckError.message("Timer did not start.") }
            var runningDraft = EntryDraft(entry: entry)
            runningDraft.task = marker + " timer edited"; runningDraft.duration = "5:00"; runningDraft.date = "2020-01-01"
            guard let runningPatch = try runningDraft.patchBody(for: entry), runningPatch["durationSeconds"] == nil, runningPatch["date"] == nil else { throw CheckError.message("Running edit included date or duration.") }
            _ = try await api.request("PATCH", path: EntryDraft.path(for: entry), body: runningPatch)
            let runningEdited = try await api.state()
            guard let entry = runningEdited.runningEntry, entry.task == marker + " timer edited" else { throw CheckError.message("Running entry edit did not persist.") }
            do { _ = try await api.request("PATCH", path: EntryDraft.path(for: entry), body: ["version": entry.version, "durationSeconds": 60]); throw CheckError.message("Running duration edit was accepted.") } catch APIError.server(409, _) {}
            do { _ = try await api.request("DELETE", path: EntryDraft.deletePath(for: entry)); throw CheckError.message("Running entry delete was accepted.") } catch APIError.server(409, _) {}
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
            guard let finished = try await api.state().entries.first(where: { $0.id == entry.id }), EntryDraft.canDelete(finished, userId: initial.user.id) else { throw CheckError.message("Stopped timer entry cannot be deleted.") }
            _ = try await api.request("DELETE", path: EntryDraft.deletePath(for: finished))
            _ = try await api.request("POST", path: "/api/auth/logout", body: [:])
            print("PASS: native API login, conditional state sync, idempotent manual time, agent usage decoding, entry edit/stale-edit/delete, running-entry edit limits, start, elapsed persistence, stop, resume, stale-stop protection, and logout.")
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
