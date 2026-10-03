import Foundation

public enum HostedBillingSessionError: Error, Sendable {
    case presenterUnavailable
    case missingHostedURL
    case userCanceled
}

/// Opens Stripe hosted Checkout or Setup in a system web authentication session.
public protocol HostedBillingSessionPresenting: Sendable {
    @MainActor func presentHostedSession(url: URL) async throws -> URL
}

public struct UnavailableHostedBillingSessionPresenter: HostedBillingSessionPresenting {
    public init() {}

    public func presentHostedSession(url: URL) async throws -> URL {
        _ = url
        throw HostedBillingSessionError.presenterUnavailable
    }
}
