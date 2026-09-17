import Foundation

public enum EntryEditError: LocalizedError, Equatable {
    case locked(String), invalidDuration, missingProject
    public var errorDescription: String? {
        switch self {
        case .locked(let reason): return reason
        case .invalidDuration: return "Enter a duration such as 1:30, 1.5, or 1:30:15 (up to one week)."
        case .missingProject: return "Choose a project for this entry."
        }
    }
}

/// Editable values for an existing entry, compared against the version the form was opened with.
public struct EntryDraft: Equatable {
    /// PATCH accepts whole seconds from 0 through one week.
    public static let maximumSeconds = 604800
    public var projectId: String
    public var task: String
    public var notes: String
    public var date: String
    public var duration: String
    public var billable: Bool

    public init(projectId: String, task: String, notes: String, date: String, duration: String, billable: Bool) {
        self.projectId = projectId; self.task = task; self.notes = notes; self.date = date; self.duration = duration; self.billable = billable
    }
    public init(entry: Entry) {
        self.init(projectId: entry.projectId, task: entry.task, notes: entry.notes, date: entry.date, duration: CropsTime.durationText(entry.durationSeconds), billable: entry.billable)
    }

    public static func lockReason(_ entry: Entry) -> String? {
        guard entry.isLocked else { return nil }
        let status = entry.status.lowercased()
        let label = ["invoiced", "paid"].contains(status) ? status : "marked \(status)"
        return "This entry is locked because it has been \(label). A team admin can mark it unbilled in the web app before it can change."
    }
    /// Delete is offered only where the API allows it: your own stopped, unbilled time.
    public static func canDelete(_ entry: Entry, userId: String) -> Bool {
        entry.userId == userId && !entry.isRunning && !entry.isLocked
    }
    public var parsedDuration: Int? { CropsTime.parseDuration(duration, maximumSeconds: Self.maximumSeconds, allowZero: true) }

    /// Only changed fields are sent. A running timer never sends date or duration, which the API rejects until it stops.
    public func changes(from entry: Entry) throws -> [String: Any] {
        if let reason = Self.lockReason(entry) { throw EntryEditError.locked(reason) }
        guard !projectId.isEmpty else { throw EntryEditError.missingProject }
        var body: [String: Any] = [:]
        if projectId != entry.projectId { body["projectId"] = projectId }
        let trimmedTask = task.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedTask != entry.task { body["task"] = trimmedTask }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedNotes != entry.notes { body["notes"] = trimmedNotes }
        if billable != entry.billable { body["billable"] = billable }
        if !entry.isRunning {
            if date != entry.date { body["date"] = date }
            guard let seconds = parsedDuration else { throw EntryEditError.invalidDuration }
            if seconds != Int(max(0, entry.durationSeconds).rounded()) { body["durationSeconds"] = seconds }
        }
        return body
    }
    /// The PATCH body with the displayed version, or nil when nothing changed.
    public func patchBody(for entry: Entry) throws -> [String: Any]? {
        var body = try changes(from: entry)
        guard !body.isEmpty else { return nil }
        body["version"] = entry.version
        return body
    }

    public static func path(for entry: Entry) -> String {
        "/api/entries/\(entry.id.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? entry.id)"
    }
    public static func deletePath(for entry: Entry) -> String { "\(path(for: entry))?version=\(entry.version)" }
}
