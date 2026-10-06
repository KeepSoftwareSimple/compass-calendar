import Foundation

/// Write-side guest entry (no responseStatus), mirrors AttendeeInput on the web.
public struct DraftAttendeeInput: Codable, Hashable, Sendable, Equatable {
    public var email: String
    public var displayName: String?

    public init(email: String, displayName: String? = nil) {
        self.email = email
        self.displayName = displayName
    }

    public func toOrganizerWire() -> EventContentDetailsOrganizer {
        EventContentDetailsOrganizer(displayName: displayName, email: email)
    }
}
