import Foundation

/// Plans Go to date status accessibility delivery without AppKit.
public enum CommandPaletteStatusAnnouncementDelivery: Equatable, Sendable {
    /// Speak `payload` on every call, including repeats of the same string.
    /// `mirror` is the XCUITest probe text when probes attach; nil in production.
    case speak(payload: String, mirror: String?)
    /// Hide the probe and skip `announcementRequested`.
    case clear
}

public enum CommandPaletteStatusAnnouncementPlanner {
    public static func deliver(
        announcement: String?,
        attachesAccessibilityProbes: Bool
    ) -> CommandPaletteStatusAnnouncementDelivery {
        guard let announcement, !announcement.isEmpty else {
            return .clear
        }
        return .speak(
            payload: announcement,
            mirror: attachesAccessibilityProbes ? announcement : nil
        )
    }
}
