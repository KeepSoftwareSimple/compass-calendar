import CompassData
import CompassKit
import Foundation

actor PostHogAnalyticsIdentityCoordinator: AnalyticsIdentityCoordinator {
    private let analytics: ProductAnalyticsClient

    init(analytics: ProductAnalyticsClient) {
        self.analytics = analytics
    }

    func applyPostHogConfig(_ config: AppConfigPosthog?) async {
        if let config {
            await PostHogCapture.shared.configure(posthog: config)
        } else {
            await PostHogCapture.shared.configureFromBundle()
        }
    }

    func identify(userId: String) async {
        await PostHogCapture.shared.identify(distinctId: userId)
    }

    func resetIdentity() async {
        await PostHogCapture.shared.resetIdentity()
    }

    func trackLoginCompleted() async {
        analytics.track(.loginCompleted, properties: [:])
    }
}
