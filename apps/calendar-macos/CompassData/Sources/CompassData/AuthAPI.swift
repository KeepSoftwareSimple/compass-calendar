import Foundation

public struct AuthFormField: Encodable, Sendable {
    public let id: String
    public let value: String

    public init(id: String, value: String) {
        self.id = id
        self.value = value
    }
}

private struct AuthFormBody: Encodable, Sendable {
    let formFields: [AuthFormField]
}

public struct SignInUpRequest: Encodable, Sendable {
    public let thirdPartyId: String
    public let clientType: String
    public let redirectURIInfo: RedirectURIInfo

    public struct RedirectURIInfo: Encodable, Sendable {
        public let redirectURIOnProviderDashboard: String
        public let redirectURIQueryParams: RedirectURIQueryParams
        public let pkceCodeVerifier: String?

        public struct RedirectURIQueryParams: Encodable, Sendable {
            public let code: String
            public let scope: String?
            public let state: String?
            public let user: String?
        }
    }

    public init(
        thirdPartyId: String,
        clientType: String = "web",
        redirectURIInfo: RedirectURIInfo
    ) {
        self.thirdPartyId = thirdPartyId
        self.clientType = clientType
        self.redirectURIInfo = redirectURIInfo
    }
}

public struct AuthAPI {
    private let client: CompassAPIClient

    init(client: CompassAPIClient) {
        self.client = client
    }

    public func signUp(name: String, email: String, password: String) async throws {
        try await postAuthForm(path: "signup", fields: [
            AuthFormField(id: "name", value: name),
            AuthFormField(id: "email", value: email),
            AuthFormField(id: "password", value: password),
        ])
    }

    public func signIn(email: String, password: String) async throws {
        try await postAuthForm(path: "signin", fields: [
            AuthFormField(id: "email", value: email),
            AuthFormField(id: "password", value: password),
        ])
    }

    public func signInUp(_ request: SignInUpRequest) async throws {
        let payload = try await client.sendRaw(
            method: "POST",
            path: "signinup",
            bodyData: try JSONEncoder().encode(request),
            auth: .headerSession,
            allowRefresh: false,
            extraHeaders: ["rid": "thirdparty"]
        )
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
        try storeSession(from: payload)
    }

    public func refresh() async throws {
        try await client.refreshSessionSingleFlight()
    }

    public func signOut() async throws {
        guard let tokens = try client.currentSession() else {
            try client.signOutLocally()
            return
        }
        let payload = try await client.sendRaw(
            method: "POST",
            path: "signout",
            auth: .headerSession,
            allowRefresh: false,
            extraHeaders: [SessionHeader.refreshTokenBody: tokens.refreshToken]
        )
        if !(200 ..< 300).contains(payload.statusCode) {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
        try client.signOutLocally()
    }

    public func forgotPassword(email: String) async throws {
        try await postAuthForm(path: "user/password/reset/token", fields: [
            AuthFormField(id: "email", value: email),
        ])
    }

    public func resetPassword(token: String, password: String) async throws {
        try await postAuthForm(path: "user/password/reset", fields: [
            AuthFormField(id: "password", value: password),
            AuthFormField(id: "token", value: token),
        ])
    }

    private func postAuthForm(path: String, fields: [AuthFormField]) async throws {
        let body = AuthFormBody(formFields: fields)
        let payload = try await client.sendRaw(
            method: "POST",
            path: path,
            bodyData: try JSONEncoder().encode(body),
            auth: .headerSession,
            allowRefresh: false
        )
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
        if path == "signup" || path == "signin" {
            try storeSession(from: payload)
        }
    }

    private func storeSession(from payload: HTTPResponsePayload) throws {
        var headers = [String: String]()
        for (key, value) in payload.headers {
            headers[key] = value
        }
        let response = HTTPURLResponse(
            url: URL(string: "https://compasscalendar.com")!,
            statusCode: payload.statusCode,
            httpVersion: nil,
            headerFields: headers
        )!
        try client.storeSessionHeaders(from: response)
    }
}
