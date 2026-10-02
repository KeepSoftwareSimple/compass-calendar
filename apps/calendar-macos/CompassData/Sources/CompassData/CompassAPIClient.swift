import CompassKit
import Foundation

public actor CompassAPIClient {
    public let baseURL: URL
    private let sessionStore: any SessionStore
    private let urlSession: URLSession
    private let interceptor: AuthInterceptor
    private var refreshTask: Task<Void, Error>?

    public init(
        appURL: URL = AppHostPreference.productionURL,
        sessionStore: any SessionStore = KeychainSessionStore(),
        urlSession: URLSession = .shared,
        interceptor: AuthInterceptor = AuthInterceptor()
    ) {
        self.baseURL = CompassAPIOrigin.apiBaseURL(appURL: appURL)
        self.sessionStore = sessionStore
        self.urlSession = urlSession
        self.interceptor = interceptor
    }

    public var events: EventsAPI { EventsAPI(client: self) }
    public var calendars: CalendarsAPI { CalendarsAPI(client: self) }
    public var user: UserAPI { UserAPI(client: self) }
    public var config: ConfigAPI { ConfigAPI(client: self) }
    public var contacts: ContactsAPI { ContactsAPI(client: self) }
    public var auth: AuthAPI { AuthAPI(client: self) }

    public func currentSession() throws -> SessionTokens? {
        try sessionStore.load()
    }

    public func signOutLocally() throws {
        try sessionStore.clear()
    }

    func sendRaw(
        method: String,
        path: String,
        queryItems: [URLQueryItem] = [],
        bodyData: Data? = nil,
        contentType: String? = "application/json",
        auth: RequestAuthMode = .bearerAccess,
        allowRefresh: Bool = true,
        extraHeaders: [String: String] = [:]
    ) async throws -> HTTPResponsePayload {
        try await sendRawOnce(
            method: method,
            path: path,
            queryItems: queryItems,
            bodyData: bodyData,
            contentType: contentType,
            auth: auth,
            allowRefresh: allowRefresh,
            retriedAfterRefresh: false,
            extraHeaders: extraHeaders
        )
    }

    private func sendRawOnce(
        method: String,
        path: String,
        queryItems: [URLQueryItem],
        bodyData: Data?,
        contentType: String?,
        auth: RequestAuthMode,
        allowRefresh: Bool,
        retriedAfterRefresh: Bool,
        extraHeaders: [String: String]
    ) async throws -> HTTPResponsePayload {
        var request = try makeRequest(
            method: method,
            path: path,
            queryItems: queryItems,
            bodyData: bodyData,
            contentType: contentType,
            auth: auth,
            extraHeaders: extraHeaders
        )
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CompassAPIError.transport("Missing HTTPURLResponse")
        }
        let body = String(data: data, encoding: .utf8) ?? ""
        let payload = HTTPResponsePayload(
            statusCode: http.statusCode,
            headers: http.allHeaderFields.reduce(into: [:]) { result, entry in
                if let key = entry.key as? String, let value = entry.value as? String {
                    result[key] = value
                }
            },
            body: body
        )

        if allowRefresh,
           auth == .bearerAccess || auth == .headerSession,
           http.statusCode == 401,
           interceptor.shouldRefreshAfterUnauthorized(body: body),
           !retriedAfterRefresh
        {
            try await refreshSessionSingleFlight()
            return try await sendRawOnce(
                method: method,
                path: path,
                queryItems: queryItems,
                bodyData: bodyData,
                contentType: contentType,
                auth: auth,
                allowRefresh: false,
                retriedAfterRefresh: true,
                extraHeaders: extraHeaders
            )
        }

        if http.statusCode == 401, interceptor.shouldRefreshAfterUnauthorized(body: body) {
            try? sessionStore.clear()
            throw CompassAPIError.sessionExpired
        }

        return payload
    }

    func sendDecodable<T: Decodable>(
        method: String,
        path: String,
        queryItems: [URLQueryItem] = [],
        body: (any Encodable)? = nil,
        auth: RequestAuthMode = .bearerAccess,
        decoder: JSONDecoder = JSONDecoder()
    ) async throws -> T {
        let bodyData = try body.map { try JSONEncoder().encode($0) }
        let payload = try await sendRaw(
            method: method,
            path: path,
            queryItems: queryItems,
            bodyData: bodyData,
            auth: auth
        )
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
        guard !payload.body.isEmpty else {
            throw CompassAPIError.decodeFailed
        }
        guard let data = payload.body.data(using: .utf8) else {
            throw CompassAPIError.decodeFailed
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw CompassAPIError.decodeFailed
        }
    }

    func sendVoid(
        method: String,
        path: String,
        queryItems: [URLQueryItem] = [],
        body: (any Encodable)? = nil,
        auth: RequestAuthMode = .bearerAccess
    ) async throws {
        let bodyData = try body.map { try JSONEncoder().encode($0) }
        let payload = try await sendRaw(
            method: method,
            path: path,
            queryItems: queryItems,
            bodyData: bodyData,
            auth: auth
        )
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
    }

    func storeSessionHeaders(from response: HTTPURLResponse) throws {
        guard let tokens = interceptor.tokens(from: response) else {
            throw CompassAPIError.missingSession
        }
        try sessionStore.save(tokens)
    }

    func refreshSessionSingleFlight() async throws {
        if let refreshTask {
            try await refreshTask.value
            return
        }
        let task = Task {
            try await performRefresh()
        }
        refreshTask = task
        defer { refreshTask = nil }
        try await task.value
    }

    private func performRefresh() async throws {
        guard let tokens = try sessionStore.load() else {
            throw CompassAPIError.missingSession
        }
        let request = try makeRequest(
            method: "POST",
            path: "session/refresh",
            queryItems: [],
            bodyData: nil,
            contentType: nil,
            auth: .bearerRefresh
        )
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CompassAPIError.transport("Missing HTTPURLResponse")
        }
        let body = String(data: data, encoding: .utf8) ?? ""
        guard http.statusCode == 200 else {
            try? sessionStore.clear()
            throw CompassAPIError.sessionExpired
        }
        guard let rotated = interceptor.tokens(from: http) else {
            try? sessionStore.clear()
            throw CompassAPIError.sessionExpired
        }
        try sessionStore.save(rotated)
        _ = body
    }

    private func makeRequest(
        method: String,
        path: String,
        queryItems: [URLQueryItem],
        bodyData: Data?,
        contentType: String?,
        auth: RequestAuthMode,
        extraHeaders: [String: String] = [:]
    ) throws -> URLRequest {
        var url = baseURL.appending(path: path)
        if !queryItems.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.queryItems = queryItems
            guard let resolved = components?.url else {
                throw CompassAPIError.invalidURL
            }
            url = resolved
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let contentType {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        request.httpBody = bodyData
        let tokens = try sessionStore.load()
        interceptor.apply(to: &request, mode: auth, tokens: tokens)
        for (key, value) in extraHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        return request
    }
}
