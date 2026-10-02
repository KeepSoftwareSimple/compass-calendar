import Foundation

public enum RequestAuthMode: Sendable {
    case none
    case bearerAccess
    case bearerRefresh
    case headerSession
}

public struct AuthInterceptor: Sendable {
    public init() {}

    public func apply(
        to request: inout URLRequest,
        mode: RequestAuthMode,
        tokens: SessionTokens?
    ) {
        switch mode {
        case .none:
            break
        case .headerSession:
            request.setValue(SessionHeader.headerModeValue, forHTTPHeaderField: SessionHeader.authMode)
            if let tokens {
                request.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
            }
        case .bearerAccess:
            request.setValue(SessionHeader.headerModeValue, forHTTPHeaderField: SessionHeader.authMode)
            if let tokens {
                request.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
            }
        case .bearerRefresh:
            request.setValue(SessionHeader.headerModeValue, forHTTPHeaderField: SessionHeader.authMode)
            if let tokens {
                request.setValue("Bearer \(tokens.refreshToken)", forHTTPHeaderField: "Authorization")
            }
        }
    }

    public func shouldRefreshAfterUnauthorized(body: String) -> Bool {
        body.contains("try refresh token")
    }

    public func tokens(from response: HTTPURLResponse) -> SessionTokens? {
        func header(_ name: String) -> String? {
            response.value(forHTTPHeaderField: name)
                ?? response.value(forHTTPHeaderField: name.lowercased())
        }
        guard
            let access = header(SessionHeader.accessToken),
            let refresh = header(SessionHeader.refreshToken),
            let front = header(SessionHeader.frontToken)
        else {
            return nil
        }
        return SessionTokens(accessToken: access, refreshToken: refresh, frontToken: front)
    }
}
