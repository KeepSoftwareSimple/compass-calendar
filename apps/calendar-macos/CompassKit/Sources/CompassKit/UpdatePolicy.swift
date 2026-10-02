import Foundation

/// When and whether the app checks for updates. Sparkle itself lives in the
/// app target; this holds the decisions that can be tested without AppKit.
public enum UpdatePolicy {
    /// Seconds between background update checks (six hours).
    public static let checkInterval: TimeInterval = 6 * 60 * 60

    /// Feed for the unsigned dev channel (release-macos-dev.yml). The stable
    /// feed is `SUFeedURL` in Info.plist and must never move; this one is only
    /// ever read by builds stamped with `COMPASS_UPDATE_CHANNEL=dev`.
    public static let devFeedURL =
        "https://github.com/KeepSoftwareSimple/compass-calendar/releases/download/macos-dev/appcast.xml"

    public static func isDevChannel(_ channel: String?) -> Bool {
        channel == "dev"
    }

    /// The feed to use instead of Info.plist's `SUFeedURL`, or nil for stable.
    public static func feedURLOverride(channel: String?) -> String? {
        isDevChannel(channel) ? devFeedURL : nil
    }

    /// Updates run only when a Sparkle public key is baked into Info.plist.
    /// Without one Sparkle cannot verify a download, so the updater stays off
    /// and the app behaves as before (local and unsigned builds).
    public static func isEnabled(publicKey: String?) -> Bool {
        guard let publicKey else { return false }
        return !publicKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
