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
        let demoPresentation = FixtureLaunchPolicy.demoFixture
        let environment = try NativeCalendarEnvironment(
            inMemoryDatabase: demoPresentation != nil,
            analytics: analytics,
            analyticsIdentity: identity,
            sessionPresenter: sessionPresenter)
        environment.oauthService.setWebAuthPresenter(oauthPresenter)
        return NativeCalendarRootModel(
            environment: environment,
            demoPresentation: demoPresentation,
            overlayStores: overlays)
    }
}
