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
    public let agent: AgentUsage?
    public let version: Int

    private enum CodingKeys: String, CodingKey { case id, teamId, userId, projectId, task, notes, date, durationSeconds, startedAt, billable, status, agent, version }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        teamId = try c.decode(String.self, forKey: .teamId)
        userId = try c.decode(String.self, forKey: .userId)
        projectId = try c.decode(String.self, forKey: .projectId)
        task = try c.decode(String.self, forKey: .task)
        notes = try c.decode(String.self, forKey: .notes)
        date = try c.decode(String.self, forKey: .date)
        durationSeconds = try c.decode(Double.self, forKey: .durationSeconds)
        startedAt = try c.decodeIfPresent(String.self, forKey: .startedAt)
        billable = try c.decode(Bool.self, forKey: .billable)
        status = try c.decode(String.self, forKey: .status)
        // Agent usage is optional metadata; an older server or an unexpected shape never hides the entry.
        agent = (try? c.decodeIfPresent(AgentUsage.self, forKey: .agent)) ?? nil
        version = try c.decode(Int.self, forKey: .version)
    }

    public var isRunning: Bool { startedAt != nil }
    public var isLocked: Bool { status != "unbilled" }

    public func elapsed(at now: Date = Date(), serverOffset: TimeInterval = 0) -> TimeInterval {
        guard let startedAt, let start = CropsTime.parseISO(startedAt) else { return max(0, durationSeconds) }
        return max(0, durationSeconds) + max(0, now.addingTimeInterval(serverOffset).timeIntervalSince(start))
    }
}
/// Usage an agent reported for an entry. Crops displays it; it does not meter anything.
public struct AgentUsage: Codable, Hashable {
    public let tokens: Int64
    public let cost: Double
    public let model: String?

    public init(tokens: Int64, cost: Double, model: String? = nil) { self.tokens = tokens; self.cost = cost; self.model = model }
    private enum CodingKeys: String, CodingKey { case tokens, cost, model }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let whole = try? c.decode(Int64.self, forKey: .tokens) { tokens = whole }
        else { tokens = Int64(max(0, try c.decode(Double.self, forKey: .tokens)).rounded()) }
        cost = try c.decode(Double.self, forKey: .cost)
        model = (try? c.decodeIfPresent(String.self, forKey: .model)) ?? nil
    }

    /// Matches the web app: compact en-US token count and USD cost, such as "2.41M tokens · $31.40".
    public var label: String { "\(Self.compactTokens(tokens)) tokens · \(Self.money(cost))" }

    public static func compactTokens(_ value: Int64) -> String {
        let number = Double(max(0, value))
        guard number >= 1000 else { return String(Int64(number)) }
        let units: [(Double, String)] = [(1e3, "K"), (1e6, "M"), (1e9, "B"), (1e12, "T")]
        var index = units.lastIndex { number >= $0.0 } ?? 0
        var scaled = (number / units[index].0 * 100).rounded() / 100
        if scaled >= 1000 && index < units.count - 1 { index += 1; scaled = (number / units[index].0 * 100).rounded() / 100 }
        var text = String(format: "%.2f", scaled)
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text + units[index].1
    }
    public static func money(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? String(format: "$%.2f", value)
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
    /// Accepts `1:30`, `1.5`, or `1:30:15`. New manual time allows up to 24 hours; edits may pass the API's one-week maximum.
    public static func parseDuration(_ input: String, maximumSeconds: Int = 86400, allowZero: Bool = false) -> Int? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let maximumHours = maximumSeconds / 3600
        let valid: (Int) -> Int? = { seconds in (allowZero ? seconds >= 0 : seconds > 0) && seconds <= maximumSeconds ? seconds : nil }
        if text.contains(":") {
            let parts = text.split(separator: ":", omittingEmptySubsequences: false)
            guard parts.count == 2 || parts.count == 3, parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }) else { return nil }
            // The seconds form requires two-digit minutes and seconds so a typo such as 1:2:3 is not guessed.
            if parts.count == 3 { guard parts[1].count == 2, parts[2].count == 2 else { return nil } }
            guard parts[0].count <= 6, let hours = Int(parts[0]), let minutes = Int(parts[1]), hours <= maximumHours, minutes < 60 else { return nil }
            var seconds = hours * 3600 + minutes * 60
            if parts.count == 3 { guard let extra = Int(parts[2]), extra < 60 else { return nil }; seconds += extra }
            return valid(seconds)
        }
        guard let hours = Double(text), hours.isFinite, hours >= 0, hours <= Double(maximumHours) else { return nil }
        return valid(Int((hours * 3600).rounded()))
    }
    /// Formats saved seconds so they round-trip through `parseDuration`: `1:30` or `1:30:15`.
    public static func durationText(_ seconds: Double) -> String {
        let whole = Int(max(0, seconds).rounded())
        return whole % 60 == 0 ? clock(TimeInterval(whole), seconds: false) : clock(TimeInterval(whole))
    }
    /// Local calendar day for an API `yyyy-MM-dd` date key.
    public static func date(fromKey key: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter.date(from: key)
    }
}
