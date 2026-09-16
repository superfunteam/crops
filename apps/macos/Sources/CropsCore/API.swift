import Foundation

public enum APIError: LocalizedError {
    case invalidURL, insecureURL, server(Int, String), invalidResponse, redirect
    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Enter the address of your Crops server, such as https://crops.example.com."
        case .insecureURL: return "Use HTTPS for your Crops server. HTTP is supported only on this Mac for development."
        case .server(_, let message): return message
        case .invalidResponse: return "The server returned an unreadable response. Check the Crops server address."
        case .redirect: return "The server redirected this request. Enter its final HTTPS address."
        }
    }
    public var isUnauthorized: Bool { if case .server(401, _) = self { return true }; return false }
}

private final class NoRedirectDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

public final class APIClient {
    public let baseURL: URL
    public var token: String? { didSet { stateCache.removeAll() } }
    private let session: URLSession
    private var stateCache: [String: (tag: String, state: AppState, receivedAt: Date)] = [:]

    public static func validatedURL(_ address: String) throws -> URL {
        let cleaned = address.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: cleaned), let host = url.host, !host.isEmpty, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/", ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { throw APIError.invalidURL }
        guard url.scheme?.lowercased() == "https" || ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host.lowercased()) else { throw APIError.insecureURL }
        return url
    }
    public init(address: String, token: String? = nil) throws {
        self.baseURL = try Self.validatedURL(address)
        self.token = token
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 25
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: configuration, delegate: NoRedirectDelegate(), delegateQueue: nil)
    }
    public func request(_ method: String, path: String, body: [String: Any]? = nil, idempotencyKey: String? = nil) async throws -> Data {
        try await perform(method, path: path, body: body, idempotencyKey: idempotencyKey).0
    }
    private func perform(_ method: String, path: String, body: [String: Any]? = nil, idempotencyKey: String? = nil, headers: [String: String] = [:], allowNotModified: Bool = false) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if method != "GET" { request.setValue(idempotencyKey ?? UUID().uuidString, forHTTPHeaderField: "Idempotency-Key") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if response.statusCode == 304 && allowNotModified { return (data, response) }
        guard !(300...399).contains(response.statusCode) else { throw APIError.redirect }
        guard (200...299).contains(response.statusCode) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let nested = json?["error"] as? [String: Any]
            let message = json?["message"] as? String ?? nested?["message"] as? String ?? json?["error"] as? String ?? "Crops couldn't complete the request (\(response.statusCode))."
            throw APIError.server(response.statusCode, message)
        }
        return (data, response)
    }
    public func decode<T: Decodable>(_ type: T.Type, method: String = "GET", path: String, body: [String: Any]? = nil) async throws -> T {
        let data = try await request(method, path: path, body: body)
        do { return try JSONDecoder().decode(type, from: data) }
        catch { throw APIError.invalidResponse }
    }
    public func state(teamId: String? = nil) async throws -> AppState {
        let query = teamId.flatMap { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) }.map { "?teamId=\($0)" } ?? ""
        let path = "/api/state\(query)"
        let cached = stateCache[path]
        let headers = cached.map { ["If-None-Match": $0.tag] } ?? [:]
        let (data, response) = try await perform("GET", path: path, headers: headers, allowNotModified: true)
        if response.statusCode == 304 {
            guard let cached else { throw APIError.invalidResponse }
            let receivedAt = Date()
            let serverTime = CropsTime.conditionalServerTime(serverHeader: response.value(forHTTPHeaderField: "X-Crops-Server-Time"), httpDateHeader: response.value(forHTTPHeaderField: "Date"), previousServerTime: cached.state.serverTime, previousReceivedAt: cached.receivedAt, now: receivedAt)
            let old = cached.state
            let fresh = AppState(user: old.user, teams: old.teams, team: old.team, members: old.members, clients: old.clients, projects: old.projects, entries: old.entries, runningEntry: old.runningEntry, serverTime: serverTime)
            stateCache[path] = (cached.tag, fresh, receivedAt)
            return fresh
        }
        let value: AppState
        do { value = try JSONDecoder().decode(AppState.self, from: data) } catch { throw APIError.invalidResponse }
        if let tag = response.value(forHTTPHeaderField: "ETag") { stateCache[path] = (tag, value, Date()) }
        else { stateCache.removeValue(forKey: path) }
        return value
    }
}
