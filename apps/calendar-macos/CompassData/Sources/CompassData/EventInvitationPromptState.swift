import CompassKit
import Foundation

public struct EventInvitationPromptState: Equatable, Sendable {
    public var hostLabel: String

    public init(hostLabel: String) {
        self.hostLabel = hostLabel
    }
}

public struct PendingRsvpChoice: Equatable, Sendable {
    public var eventId: EventId
    public var responseStatus: ResponseStatusEnum

    public init(eventId: EventId, responseStatus: ResponseStatusEnum) {
        self.eventId = eventId
        self.responseStatus = responseStatus
    }
}
