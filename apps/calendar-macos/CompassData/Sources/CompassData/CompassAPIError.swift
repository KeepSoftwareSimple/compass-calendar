import Foundation

public enum CompassAPIError: Error, Equatable {
    case invalidURL
    case httpStatus(Int, body: String)
    case decodeFailed
    case refreshRequired
    case sessionExpired
    case missingSession
    case transport(String)
}

public struct HTTPResponsePayload: Sendable {
    public let statusCode: Int
    public let headers: [String: String]
    public let body: String

    public init(statusCode: Int, headers: [String: String], body: String) {
        self.statusCode = statusCode
        self.headers = headers
        self.body = body
    }
}
