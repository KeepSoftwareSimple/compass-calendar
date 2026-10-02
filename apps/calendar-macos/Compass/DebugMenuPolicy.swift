import CompassKit
import Foundation

enum DebugMenuPolicy {
    static func shouldShow(optionHeldAtLaunch: Bool) -> Bool {
        if optionHeldAtLaunch { return true }
        // Dev-channel builds are QA builds; keep Switch to staging visible
        // across auto-update relaunches, which cannot hold Option.
        if UpdatePolicy.isDevChannel(DesktopUpdater.channel) {
            return true
        }
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
