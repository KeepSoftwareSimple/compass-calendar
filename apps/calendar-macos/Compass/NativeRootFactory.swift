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
        let demoPresentation = FixtureLaunchPolicy.demoFixture
        let environment = try NativeCalendarEnvironment(
            inMemoryDatabase: demoPresentation != nil,
            analytics: analytics,
            analyticsIdentity: identity,
            sessionPresenter: sessionPresenter)
        environment.oauthService.setWebAuthPresenter(oauthPresenter)
        return NativeCalendarRootModel(environment: environment, demoPresentation: demoPresentation)
    }
}
