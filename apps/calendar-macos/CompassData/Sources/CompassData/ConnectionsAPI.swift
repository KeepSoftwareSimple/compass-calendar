import CompassKit
import Foundation

public enum ConnectionBeginOutcome: Sendable {
    case redirect(URL)
    case connected(ConnectionId)
}

public struct ConnectionsAPI: Sendable {
    private let client: CompassAPIClient

    init(client: CompassAPIClient) {
        self.client = client
    }

    public func begin(_ request: ConnectionBeginRequest) async throws -> ConnectionBeginOutcome {
        let payload = try await client.sendRaw(
            method: "POST",
            path: "auth/connections/begin",
            bodyData: try JSONEncoder().encode(request),
            auth: .headerSession,
            allowRefresh: true)
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
        let decoder = JSONDecoder()
        let bodyData = Data(payload.body.utf8)
        if let connected = try? decoder.decode(
            ConnectionBeginConnectedResponse.self,
            from: bodyData)
        {
            return .connected(connected.connectionId)
        }
        if let redirect = try? decoder.decode(
            ConnectionBeginRedirectResponse.self,
            from: bodyData)
        {
            guard let url = URL(string: redirect.authorizationUrl) else {
                throw CompassAPIError.httpStatus(502, body: payload.body)
            }
            return .redirect(url)
        }
        struct LegacyRedirect: Decodable {
            let authorizationUrl: String
        }
        if let legacy = try? decoder.decode(LegacyRedirect.self, from: bodyData),
           let url = URL(string: legacy.authorizationUrl)
        {
            return .redirect(url)
        }
        throw CompassAPIError.httpStatus(502, body: payload.body)
    }

    public func connectCredential(_ request: ConnectionCredentialBrowserRequest) async throws
        -> ConnectionCredentialResponse
    {
        try await client.sendDecodable(
            method: "POST",
            path: "auth/connections/credential",
            body: request,
            auth: .headerSession)
    }

    public func refresh() async throws -> ConnectionRefreshResponse {
        try await client.sendDecodable(
            method: "POST",
            path: "auth/connections/refresh",
            body: EmptyJSONBody(),
            auth: .headerSession)
    }

    public func disconnect(connectionId: ConnectionId) async throws {
        let payload = try await client.sendRaw(
            method: "DELETE",
            path: "auth/connections/\(connectionId.rawValue)",
            auth: .headerSession,
            allowRefresh: true)
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
    }
}

private struct EmptyJSONBody: Encodable, Sendable {}
