import Foundation

enum DebugMenuPolicy {
    static func shouldShow(optionHeldAtLaunch: Bool) -> Bool {
        if optionHeldAtLaunch { return true }
        if ProcessInfo.processInfo.environment["COMPASS_INTERNAL"] == "1" {
            return true
        }
        if let flag = Bundle.main.object(forInfoDictionaryKey: "COMPASS_INTERNAL") as? Bool, flag {
            return true
        }
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
}
