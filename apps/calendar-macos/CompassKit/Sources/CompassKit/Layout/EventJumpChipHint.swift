import Foundation

public struct EventJumpChipHint: Hashable, Sendable, Identifiable {
    public var id: String { eventId }
    public var eventId: String
    public var label: String
    public var frame: EventPosition

    public init(eventId: String, label: String, frame: EventPosition) {
        self.eventId = eventId
        self.label = label
        self.frame = frame
    }
}
