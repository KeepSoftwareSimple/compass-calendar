import Foundation

/// When and whether the app checks for updates. Sparkle itself lives in the
/// app target; this holds the decisions that can be tested without AppKit.
public enum UpdatePolicy {
    /// Seconds between background update checks (six hours).
    public static let checkInterval: TimeInterval = 6 * 60 * 60

    /// Updates run only when a Sparkle public key is baked into Info.plist.
    /// Without one Sparkle cannot verify a download, so the updater stays off
    /// and the app behaves as before (local and unsigned builds).
    public static func isEnabled(publicKey: String?) -> Bool {
        guard let publicKey else { return false }
        return !publicKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
