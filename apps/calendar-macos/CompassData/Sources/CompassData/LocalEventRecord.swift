import CompassKit
import Foundation

/// Mirrors `apps/calendar-web/src/events/types/local-event.record.ts`.
public struct LocalEventRecord: Codable, Sendable, Equatable {
    public static let schemaVersion = 2

    public var version: Int
    public var id: EventId
    public var event: Event
    public var isDemo: Bool
    public var exdates: [String]?

    public init(
        id: EventId,
        event: Event,
        isDemo: Bool,
        exdates: [String]? = nil
    ) {
        version = Self.schemaVersion
        self.id = id
        self.event = event
        self.isDemo = isDemo
        self.exdates = exdates
    }
}
