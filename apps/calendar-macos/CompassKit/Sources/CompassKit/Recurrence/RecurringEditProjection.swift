import Foundation

public struct RecurringEditProjection: Sendable, Equatable {
    public let removeIds: Set<String>
    public let upserts: [Event]

    public init(removeIds: Set<String>, upserts: [Event]) {
        self.removeIds = removeIds
        self.upserts = upserts
    }
}
