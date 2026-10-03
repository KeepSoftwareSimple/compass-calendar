import CompassData
import Foundation

enum NativeRootFactory {
    @MainActor
    static func makeModel() throws -> NativeCalendarRootModel {
        let analytics = PostHogAnalyticsClient()
        let identity = PostHogAnalyticsIdentityCoordinator(analytics: analytics)
        let sessionPresenter = WebAuthSessionPresenter()
        let demoPresentation = FixtureLaunchPolicy.demoFixture
        let environment = try NativeCalendarEnvironment(
            inMemoryDatabase: demoPresentation != nil,
            analytics: analytics,
            analyticsIdentity: identity,
            sessionPresenter: sessionPresenter)
        return NativeCalendarRootModel(environment: environment, demoPresentation: demoPresentation)
    }
}
