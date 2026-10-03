import CompassData
import Foundation

enum NativeRootFactory {
    @MainActor
    static func makeModel(webAuthPresenter: WebAuthSessionPresenting? = nil) throws
        -> NativeCalendarRootModel
    {
        let analytics = PostHogAnalyticsClient()
        let identity = PostHogAnalyticsIdentityCoordinator(analytics: analytics)
        let sessionPresenter = WebAuthSessionPresenter()
        let oauthPresenter = webAuthPresenter ?? sessionPresenter
        if let fixture = FixtureLaunchPolicy.demoFixture {
            let environment = try NativeCalendarEnvironment(
                fixture: fixture,
                analytics: analytics,
                analyticsIdentity: identity,
                sessionPresenter: sessionPresenter)
            environment.oauthService.setWebAuthPresenter(oauthPresenter)
            return NativeCalendarRootModel(environment: environment, demoSeed: fixture)
        }
        let environment = try NativeCalendarEnvironment(
            analytics: analytics,
            analyticsIdentity: identity,
            sessionPresenter: sessionPresenter)
        environment.oauthService.setWebAuthPresenter(oauthPresenter)
        return NativeCalendarRootModel(environment: environment)
    }
}
