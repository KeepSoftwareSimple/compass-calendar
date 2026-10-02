import Foundation

public struct SessionTokens: Equatable, Sendable, Codable {
    public var accessToken: String
    public var refreshToken: String
    public var frontToken: String

    public init(accessToken: String, refreshToken: String, frontToken: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.frontToken = frontToken
    }
}

public enum SessionHeader {
    public static let authMode = "st-auth-mode"
    public static let headerModeValue = "header"
    public static let accessToken = "st-access-token"
    public static let refreshToken = "st-refresh-token"
    public static let frontToken = "front-token"
    public static let refreshTokenBody = "st-refresh-token"
}
