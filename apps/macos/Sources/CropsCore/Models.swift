import Foundation

public struct User: Codable { public let id: String; public let name: String; public let username: String }
public struct Team: Codable, Identifiable, Hashable { public let id: String; public let name: String; public let role: String }
public struct Member: Codable, Identifiable { public let id: String; public let userId: String; public let name: String; public let username: String; public let role: String }
public struct Client: Codable, Identifiable { public let id: String; public let teamId: String; public let name: String; public let email: String?; public let archived: Bool? }
public struct Project: Codable, Identifiable, Hashable {
    public let id: String
    public let teamId: String
    public let clientId: String?
    public let name: String
    public let code: String?
    public let color: String
    public let billable: Bool
    public let rate: Double?
    public let budgetHours: Double?
    public let archived: Bool?
}
public struct Entry: Codable, Identifiable {
    public let id: String
    public let teamId: String
    public let userId: String
    public let projectId: String
    public let task: String
    public let notes: String
    public let date: String
    public let durationSeconds: Double
    public let startedAt: String?
    public let billable: Bool
    public let status: String
    public let version: Int

    public func elapsed(at now: Date = Date(), serverOffset: TimeInterval = 0) -> TimeInterval {
        guard let startedAt, let start = CropsTime.parseISO(startedAt) else { return max(0, durationSeconds) }
        return max(0, durationSeconds) + max(0, now.addingTimeInterval(serverOffset).timeIntervalSince(start))
    }
}
public struct AppState: Codable {
    public let user: User
    public let teams: [Team]
    public let team: Team
    public let members: [Member]
    public let clients: [Client]
    public let projects: [Project]
    public let entries: [Entry]
    public let runningEntry: Entry?
    public let serverTime: String
}
public struct AuthResponse: Codable { public let token: String; public let user: User }

public enum CropsTime {
    /// CDNs may strip custom headers from 304 responses while keeping standard Date.
    public static func conditionalServerTime(serverHeader: String?, httpDateHeader: String?, previousServerTime: String, previousReceivedAt: Date, now: Date = Date()) -> String {
        if let serverHeader, parseISO(serverHeader) != nil { return serverHeader }
        let http = DateFormatter()
        http.locale = Locale(identifier: "en_US_POSIX")
        http.timeZone = TimeZone(secondsFromGMT: 0)
        http.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        http.isLenient = false
        let date: Date
        if let httpDateHeader, let parsed = http.date(from: httpDateHeader) { date = parsed }
        else if let previous = parseISO(previousServerTime) { date = previous.addingTimeInterval(max(0, now.timeIntervalSince(previousReceivedAt))) }
        else { date = now }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.string(from: date)
    }
    public static func parseISO(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
    public static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    public static func clock(_ interval: TimeInterval, seconds: Bool = true) -> String {
        let whole = Int(max(0, interval).rounded(.down))
        if seconds { return String(format: "%d:%02d:%02d", whole / 3600, whole / 60 % 60, whole % 60) }
        return String(format: "%d:%02d", whole / 3600, whole / 60 % 60)
    }
    public static func parseDuration(_ input: String) -> Int? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.contains(":") {
            let parts = text.split(separator: ":", omittingEmptySubsequences: false)
            guard parts.count == 2, let hours = Int(parts[0]), let minutes = Int(parts[1]), hours >= 0, hours <= 24, minutes >= 0, minutes < 60 else { return nil }
            let seconds = hours * 3600 + minutes * 60
            return seconds > 0 && seconds <= 86400 ? seconds : nil
        }
        guard let hours = Double(text), hours.isFinite, hours > 0, hours <= 24 else { return nil }
        let seconds = Int((hours * 3600).rounded())
        return seconds > 0 ? seconds : nil
    }
}
