import AppKit
import CompassKit
import ServiceManagement

enum DesktopNativeServices {
    static func applyAppearance(theme: String) {
        let mapped = DesktopThemeAppearance(webTheme: theme)
        let appearance = NSAppearance(named: NSAppearance.Name(rawValue: mapped.nsAppearanceName))
        NSApp.appearance = appearance
    }

    static func launchAtLoginEnabled() -> Bool {
        SMAppService.mainApp.status == .enabled
    }

    static func setLaunchAtLogin(_ enabled: Bool) throws {
        if enabled {
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    }
}
