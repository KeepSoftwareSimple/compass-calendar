import Foundation

enum NativeUILaunchPolicy {
    private static let enabledDefaultsKey = "COMPASS_NATIVE_UI"

    /// Launch argument `-COMPASS_NATIVE_UI YES` or the Debug menu preference.
    static func shouldUseNativeUI(showDebugMenu: Bool) -> Bool {
        if launchArgumentEnabled == true {
            return true
        }
        if showDebugMenu, UserDefaults.standard.bool(forKey: enabledDefaultsKey) {
            return true
        }
        return false
    }

    static var launchArgumentEnabled: Bool? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-COMPASS_NATIVE_UI"), index + 1 < args.count else {
            return nil
        }
        return args[index + 1].uppercased() == "YES"
    }

    static var isDebugPreferenceEnabled: Bool {
        UserDefaults.standard.bool(forKey: enabledDefaultsKey)
    }

    static func setDebugPreferenceEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: enabledDefaultsKey)
    }
}
