import CompassKit
import Foundation

public protocol AnalyticsIdentityCoordinator: Sendable {
    func applyPostHogConfig(_ config: AppConfigPosthog?) async
    func identify(userId: String) async
    func resetIdentity() async
    func trackLoginCompleted() async
}

public struct NoOpAnalyticsIdentityCoordinator: AnalyticsIdentityCoordinator {
    public init() {}

    public func applyPostHogConfig(_ config: AppConfigPosthog?) async {}

    public func identify(userId: String) async {}

    public func resetIdentity() async {}

    public func trackLoginCompleted() async {}
}
