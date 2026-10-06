import CompassData
import CompassKit
import CompassUI
import Foundation

@MainActor
final class NativeAppSettingsBridge: NativeSettingsBridge {
    private weak var rootController: NativeRootController?

    init(rootController: NativeRootController) {
        self.rootController = rootController
    }

    func launchAtLoginEnabled() -> Bool {
        DesktopNativeServices.launchAtLoginEnabled()
    }

    func setLaunchAtLogin(_ enabled: Bool) throws {
        try DesktopNativeServices.setLaunchAtLogin(enabled)
    }

    func applyQuickAddHotKey(_ displayString: String) {}

    func applyTheme(_ theme: CompassThemeName) {
        rootController?.setWebTheme(NativeWebTheme(themeName: theme))
    }
}
