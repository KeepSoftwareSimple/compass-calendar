import AppKit
import CompassKit
import ServiceManagement

enum DesktopNativeServices {
    static func applyAppearance(theme: String) {
        let mapped = DesktopThemeAppearance(webTheme: theme)
        let appearance = NSAppearance(named: NSAppearance.Name(rawValue: mapped.nsAppearanceName))
        NSApp.appearance = appearance
        if let url = Bundle.main.url(forResource: mapped.appIconResourceName, withExtension: "png"),
           let icon = NSImage(contentsOf: url)
        {
            NSApp.applicationIconImage = icon
        }
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
