import CompassData
import Foundation

enum NativeRootFactory {
    @MainActor
    static func makeModel() throws -> NativeCalendarRootModel {
        let analytics = PostHogAnalyticsClient()
        let identity = PostHogAnalyticsIdentityCoordinator(analytics: analytics)
        let sessionPresenter = WebAuthSessionPresenter()
        if let fixture = FixtureLaunchPolicy.demoFixture {
            let environment = try NativeCalendarEnvironment(
                fixture: fixture,
                analytics: analytics,
                analyticsIdentity: identity,
                sessionPresenter: sessionPresenter)
            return NativeCalendarRootModel(environment: environment, demoSeed: fixture)
        }
        let environment = try NativeCalendarEnvironment(
            analytics: analytics,
            analyticsIdentity: identity,
            sessionPresenter: sessionPresenter)
        return NativeCalendarRootModel(environment: environment)
    }
}
