import CompassData
import CompassKit
import CompassUI
import Foundation

@MainActor
final class NativeAppSettingsBridge: NativeSettingsBridge {
    private weak var rootController: NativeRootController?
    private weak var quickAddRouter: DesktopQuickAddRouting?

    init(rootController: NativeRootController, quickAddRouter: DesktopQuickAddRouting? = nil) {
        self.rootController = rootController
        self.quickAddRouter = quickAddRouter
    }

    func attachQuickAddRouter(_ router: DesktopQuickAddRouting) {
        quickAddRouter = router
    }

    func launchAtLoginEnabled() -> Bool {
        DesktopNativeServices.launchAtLoginEnabled()
    }

    func setLaunchAtLogin(_ enabled: Bool) throws {
        try DesktopNativeServices.setLaunchAtLogin(enabled)
    }

    func applyQuickAddHotKey(_ displayString: String) {
        quickAddRouter?.setQuickAddHotkey(displayString)
    }

    func applyTheme(_ theme: CompassThemeName) {
        rootController?.setWebTheme(NativeWebTheme(themeName: theme))
    }
}
