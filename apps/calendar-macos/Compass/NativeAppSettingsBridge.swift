import CompassData
import CompassKit
import CompassUI
import Foundation

@MainActor
final class NativeAppSettingsBridge: NativeSettingsBridge {
    private weak var rootController: NativeRootController?
    private let hotKeyController: QuickAddHotKeyController

    init(rootController: NativeRootController, hotKeyController: QuickAddHotKeyController) {
        self.rootController = rootController
        self.hotKeyController = hotKeyController
    }

    func launchAtLoginEnabled() -> Bool {
        DesktopNativeServices.launchAtLoginEnabled()
    }

    func setLaunchAtLogin(_ enabled: Bool) throws {
        try DesktopNativeServices.setLaunchAtLogin(enabled)
    }

    func applyQuickAddHotKey(_ displayString: String) {
        hotKeyController.applyShortcut(displayString)
    }

    func applyTheme(_ theme: CompassThemeName) {
        rootController?.setWebTheme(NativeWebTheme(themeName: theme))
    }
}
