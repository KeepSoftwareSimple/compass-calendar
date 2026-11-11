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

public enum HiddenEventWriteResult: Sendable, Equatable {
    case applied
    case superseded
}

@MainActor
@Observable
public final class HiddenEventsStore {
    public private(set) var hiddenEventIds: Set<EventId> = []
    public private(set) var source: HiddenEventRepositorySource

    private let repository: HiddenEventRepository
    private let remoteClient: HiddenEventsRemoteClient
    private struct HiddenWriteChain {
        var generation: UInt64
        var task: Task<Void, Never>
    }

    private var hiddenWriteChains: [EventId: HiddenWriteChain] = [:]
    private var hiddenWriteGeneration: UInt64 = 0
    private var intendedHiddenByEventId: [EventId: Bool] = [:]

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
            hiddenEventIds = mergePendingIntent(into: Set(ids.map { EventId(rawValue: $0) }))
            try repository.replaceAll(eventIds: Array(hiddenEventIds))
        case .local:
            let ids = Set(try repository.fetchAll())
            hiddenEventIds = mergePendingIntent(into: ids)
        }
    }

    @discardableResult
    public func setEventHidden(eventId: EventId, hidden: Bool) async throws -> HiddenEventWriteResult {
        let generation = hiddenWriteGeneration + 1
        hiddenWriteGeneration = generation
        let waitFor = hiddenWriteChains[eventId]?.task
        let operation = Task<HiddenEventWriteResult, Error> { @MainActor in
            if let waitFor {
                await waitFor.value
            }
            return try await self.commitSetEventHidden(
                eventId: eventId,
                hidden: hidden,
                generation: generation)
        }
        hiddenWriteChains[eventId] = HiddenWriteChain(generation: generation, task: Task {
            _ = try? await operation.value
        })
        defer {
            if hiddenWriteChains[eventId]?.generation == generation {
                hiddenWriteChains.removeValue(forKey: eventId)
            }
        }
        return try await operation.value
    }

    private func commitSetEventHidden(
        eventId: EventId,
        hidden: Bool,
        generation: UInt64
    ) async throws -> HiddenEventWriteResult {
        guard hiddenWriteChains[eventId]?.generation == generation else {
            return .superseded
        }
        let snapshot = hiddenEventIds
        intendedHiddenByEventId[eventId] = hidden
        applyOptimistic(eventId: eventId, hidden: hidden)
        do {
            switch source {
            case .remote:
                let list = try await remoteClient.setHiddenEvents(
                    SetEventHiddenInput(eventId: eventId, hidden: hidden)
                )
                guard hiddenWriteChains[eventId]?.generation == generation else {
                    if intendedHiddenByEventId[eventId] == hidden {
                        hiddenEventIds = snapshot
                        intendedHiddenByEventId.removeValue(forKey: eventId)
                    }
                    return .superseded
                }
                if intendedHiddenByEventId[eventId] == hidden {
                    hiddenEventIds = Set(list.map { EventId(rawValue: $0) })
                    try repository.replaceAll(eventIds: Array(hiddenEventIds))
                    intendedHiddenByEventId.removeValue(forKey: eventId)
                }
            case .local:
                try repository.replaceAll(eventIds: Array(hiddenEventIds))
                if intendedHiddenByEventId[eventId] == hidden {
                    intendedHiddenByEventId.removeValue(forKey: eventId)
                }
            }
            return .applied
        } catch {
            if intendedHiddenByEventId[eventId] == hidden {
                hiddenEventIds = snapshot
                try? repository.replaceAll(eventIds: Array(snapshot))
                intendedHiddenByEventId.removeValue(forKey: eventId)
            }
            throw error
        }
    }

    private func mergePendingIntent(into ids: Set<EventId>) -> Set<EventId> {
        var merged = ids
        for (eventId, hidden) in intendedHiddenByEventId {
            if hidden {
                merged.insert(eventId)
            } else {
                merged.remove(eventId)
            }
        }
        return merged
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
