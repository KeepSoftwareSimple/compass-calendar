import CompassData
import CompassKit
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
        let appURL = AppOrigin.resolve(
            override: UserDefaults.standard.string(forKey: "COMPASS_APP_URL"),
            infoValue: Bundle.main.object(forInfoDictionaryKey: "COMPASS_APP_URL") as? String)
        let environment = try NativeCalendarEnvironment(
            appURL: appURL,
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
