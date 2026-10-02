// Mirrors `apps/calendar-web/src/events/hidden/hidden-events.query.ts` (optimistic
// snapshot with rollback on failure, the one exception to no-rollback writes).

import CompassKit
import Foundation

public enum HiddenEventRepositorySource: String, Sendable {
    case local
    case remote
}

public protocol HiddenEventsRemoteClient: Sendable {
    func hiddenEventIds() async throws -> [String]
    func setHiddenEvents(_ input: SetEventHiddenInput) async throws -> [String]
}

extension UserAPI: HiddenEventsRemoteClient {}

@MainActor
@Observable
public final class HiddenEventsStore {
    public private(set) var hiddenEventIds: Set<EventId> = []
    public private(set) var source: HiddenEventRepositorySource

    private let repository: HiddenEventRepository
    private let remoteClient: HiddenEventsRemoteClient

    public init(
        repository: HiddenEventRepository,
        remoteClient: HiddenEventsRemoteClient,
        source: HiddenEventRepositorySource = .remote
    ) {
        self.repository = repository
        self.remoteClient = remoteClient
        self.source = source
    }

    public func load() async throws {
        switch source {
        case .remote:
            let ids = try await remoteClient.hiddenEventIds()
            hiddenEventIds = Set(ids.map { EventId(rawValue: $0) })
            try repository.replaceAll(eventIds: Array(hiddenEventIds))
        case .local:
            hiddenEventIds = Set(try repository.fetchAll())
        }
    }

    public func setEventHidden(eventId: EventId, hidden: Bool) async throws {
        let snapshot = hiddenEventIds
        applyOptimistic(eventId: eventId, hidden: hidden)
        do {
            switch source {
            case .remote:
                let list = try await remoteClient.setHiddenEvents(
                    SetEventHiddenInput(eventId: eventId, hidden: hidden)
                )
                hiddenEventIds = Set(list.map { EventId(rawValue: $0) })
                try repository.replaceAll(eventIds: Array(hiddenEventIds))
            case .local:
                try repository.replaceAll(eventIds: Array(hiddenEventIds))
            }
        } catch {
            hiddenEventIds = snapshot
            try? repository.replaceAll(eventIds: Array(snapshot))
            throw error
        }
    }

    public func isHidden(_ eventId: EventId) -> Bool {
        hiddenEventIds.contains(eventId)
    }

    private func applyOptimistic(eventId: EventId, hidden: Bool) {
        if hidden {
            hiddenEventIds.insert(eventId)
        } else {
            hiddenEventIds.remove(eventId)
        }
    }
}
