import CompassData
import CompassKit
import Foundation

actor PostHogAnalyticsIdentityCoordinator: AnalyticsIdentityCoordinator {
    private let analytics: ProductAnalyticsClient

    init(analytics: ProductAnalyticsClient) {
        self.analytics = analytics
    }

    func applyPostHogConfig(_ config: AppConfigPosthog?) async {
        guard UITestLaunchPolicy.capturesProductAnalytics else {
            await PostHogCapture.shared.disableCapture()
            return
        }
        if let config {
            await PostHogCapture.shared.configure(posthog: config)
        } else {
            await PostHogCapture.shared.configureFromBundle()
        }
    }

    func setPostHogEnvironment(hostname: String?) async {
        await PostHogCapture.shared.setEnvironment(hostname: hostname)
    }

    func identify(userId: String) async {
        await PostHogCapture.shared.identify(distinctId: userId)
    }

    func resetIdentity() async {
        await PostHogCapture.shared.resetIdentity()
    }

    func trackLoginCompleted(method: String) async {
        analytics.track(.loginCompleted, properties: ["method": .string(method)])
    }

    func trackSignupCompleted(method: String) async {
        analytics.track(.signupCompleted, properties: ["method": .string(method)])
    }
}
