import CompassData
import Foundation

enum NativeRootFactory {
    @MainActor
    static func makeModel(
        webAuthPresenter: WebAuthSessionPresenting? = nil,
        catalogController: ShortcutsCatalogWindowController? = nil
    ) throws -> NativeCalendarRootModel {
        let analytics = PostHogAnalyticsClient()
        let identity = PostHogAnalyticsIdentityCoordinator(analytics: analytics)
        let sessionPresenter = WebAuthSessionPresenter()
        let oauthPresenter = webAuthPresenter ?? sessionPresenter
        let catalog = catalogController ?? ShortcutsCatalogWindowController()
        let overlays = OverlayStores(catalog: catalog)
        if let fixture = FixtureLaunchPolicy.demoFixture {
            let environment = try NativeCalendarEnvironment(
                fixture: fixture,
                analytics: analytics,
                analyticsIdentity: identity,
                sessionPresenter: sessionPresenter)
            environment.oauthService.setWebAuthPresenter(oauthPresenter)
            return NativeCalendarRootModel(
                environment: environment,
                demoSeed: fixture,
                overlayStores: overlays)
        }
        let environment = try NativeCalendarEnvironment(
            analytics: analytics,
            analyticsIdentity: identity,
            sessionPresenter: sessionPresenter)
        environment.oauthService.setWebAuthPresenter(oauthPresenter)
        return NativeCalendarRootModel(environment: environment, overlayStores: overlays)
    }
}
