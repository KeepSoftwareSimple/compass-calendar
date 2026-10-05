import CompassKit
import Foundation
import Observation

public enum RecurrenceScopePromotionKind: String, Sendable {
    case thisAndFollowing
    case all
}

@MainActor
@Observable
public final class RecurrenceScopeStore {
    public struct PendingDelete: Sendable, Equatable {
        public let event: Event
        public let opportunityId: Int

        public init(event: Event, opportunityId: Int) {
            self.event = event
            self.opportunityId = opportunityId
        }
    }

    public private(set) var pendingDelete: PendingDelete?
    private var nextOpportunityId = 1

    public init() {}

    public func beginDeleteAsk(for event: Event) -> Int {
        let id = nextOpportunityId
        nextOpportunityId += 1
        pendingDelete = PendingDelete(event: event, opportunityId: id)
        return id
    }

    public func clear(opportunityId: Int? = nil) {
        if let opportunityId, pendingDelete?.opportunityId != opportunityId { return }
        pendingDelete = nil
    }
}
