import Foundation

/// Plans Go to date status accessibility delivery without AppKit.
public struct CommandPaletteStatusAnnouncementDelivery: Equatable, Sendable {
    /// Payload for `NSAccessibility.Notification.announcementRequested`. Emitted on
    /// every non-empty store announcement, including repeats of the same string.
    public let announcementRequestedPayload: String?

    /// Text for the optional XCUITest mirror probe; nil when probes stay detached.
    public let mirrorText: String?

    /// When true, any attached mirror probe should hide and clear identifiers.
    public let clearProbeMirror: Bool

    public init(
        announcementRequestedPayload: String?,
        mirrorText: String?,
        clearProbeMirror: Bool
    ) {
        self.announcementRequestedPayload = announcementRequestedPayload
        self.mirrorText = mirrorText
        self.clearProbeMirror = clearProbeMirror
    }
}

public enum CommandPaletteStatusAnnouncementPlanner {
    public static func deliver(
        announcement: String?,
        attachesAccessibilityProbes: Bool
    ) -> CommandPaletteStatusAnnouncementDelivery {
        guard let announcement, !announcement.isEmpty else {
            return CommandPaletteStatusAnnouncementDelivery(
                announcementRequestedPayload: nil,
                mirrorText: nil,
                clearProbeMirror: true
            )
        }
        return CommandPaletteStatusAnnouncementDelivery(
            announcementRequestedPayload: announcement,
            mirrorText: attachesAccessibilityProbes ? announcement : nil,
            clearProbeMirror: false
        )
    }
}
