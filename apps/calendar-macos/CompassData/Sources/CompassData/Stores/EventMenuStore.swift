import CompassKit
import Foundation
import Observation

@MainActor
@Observable
public final class EventMenuStore {
    public private(set) var isOpen = false
    public private(set) var eventId: EventId?
    public private(set) var anchorPoint: CGPoint?

    public init() {}

    public func open(eventId: EventId, anchor: CGPoint?) {
        self.eventId = eventId
        anchorPoint = anchor
        isOpen = true
    }

    public func close() {
        isOpen = false
        eventId = nil
        anchorPoint = nil
    }
}
