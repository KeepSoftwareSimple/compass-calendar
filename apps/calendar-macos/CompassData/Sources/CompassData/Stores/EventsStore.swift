// Mirrors `apps/calendar-web/src/events/mutations/useEventMutations.ts`, range
// queries, and SSE invalidation via `QueryInvalidator`.

import CompassKit
import Foundation

public protocol EventsAPIProtocol: Sendable {
    func list(_ query: EventListQuery) async throws -> [EventResponseEvent]
    func create(_ input: CreateEventInput) async throws -> EventResponseEvent
    func replace(id: EventId, input: ReplaceEventInput) async throws -> EventResponseEvent
    func delete(id: EventId, scope: EventDeleteScope) async throws
    func rsvp(id: EventId, input: RsvpEventInput) async throws
}

extension EventsAPI: EventsAPIProtocol {}

@MainActor
@Observable
public final class EventsStore {
    public private(set) var inFlightMutations = 0
    public private(set) var owedInvalidation = false

    private let repository: EventRepository
    private let rangeCache: RangeCache
    private let eventsAPI: EventsAPIProtocol
    private let source: EventRepositorySource

    public init(
        repository: EventRepository,
        rangeCache: RangeCache,
        eventsAPI: EventsAPIProtocol,
        source: EventRepositorySource = .remote
    ) {
        self.repository = repository
        self.rangeCache = rangeCache
        self.eventsAPI = eventsAPI
        self.source = source
    }

    public func handleServerMessage(_ message: ServerMessage) throws {
        let targets = QueryInvalidator.invalidations(for: message)
        try applyInvalidation(targets: targets)
    }

    public func handleStreamReopen() throws {
        try applyInvalidation(targets: QueryInvalidator.streamReopenInvalidations())
    }

    public func coverage(for key: EventRangeQueryKey) throws -> RangeCoverage {
        try rangeCache.coverage(for: key)
    }

    public func fetchAllEvents() throws -> [Event] {
        try repository.fetchAll()
    }

    public func loadRange(key: EventRangeQueryKey) async throws -> [Event] {
        let coverage = try rangeCache.coverage(for: key)
        if case .fresh = coverage {
            return try eventsInRange(key: key)
        }

        let query = EventListQuery(
            kind: "timed",
            start: key.start,
            end: key.end
        )
        let remote = try await eventsAPI.list(query)
        let events = try remote.map { try EventMapping.event(from: $0) }
        try repository.upsert(events: events, isLocal: source == .local)
        try repository.pruneRemoteEvents(
            intersectingStart: key.start,
            end: key.end,
            retaining: Set(events.map(\.id))
        )
        try rangeCache.markLoaded(key: key)
        return try eventsInRange(key: key)
    }

    public func createOptimistic(
        input: CreateEventInput,
        optimisticEvent: Event
    ) async throws {
        beginMutation()
        defer { endMutation() }
        try repository.upsert(events: [optimisticEvent], isLocal: source == .local)
        do {
            let response = try await eventsAPI.create(input)
            let settled = try EventMapping.event(from: response)
            try repository.upsert(events: [settled], isLocal: source == .local)
        } catch {
            // Locked desktop decision: no rollback; settle invalidates ranges.
        }
    }

    public func replaceOptimistic(
        id: EventId,
        input: ReplaceEventInput,
        optimisticEvent: Event
    ) async throws {
        beginMutation()
        defer { endMutation() }
        let snapshot = try recurringReplaceSnapshot(targetId: id)
        if let snapshot,
           let projection = recurringReplaceProjection(
               input: input,
               edited: optimisticEvent,
               snapshot: snapshot
           )
        {
            try applyRecurringProjection(projection, edited: optimisticEvent)
        } else {
            try repository.upsert(events: [optimisticEvent], isLocal: source == .local)
        }
        do {
            let response = try await eventsAPI.replace(id: id, input: input)
            let settled = try EventMapping.event(from: response)
            if let snapshot, input.scope != .this,
               let projection = recurringReplaceProjection(
                   input: input,
                   edited: settled,
                   snapshot: snapshot
               )
            {
                try applyRecurringProjection(projection, edited: settled)
            } else {
                try repository.upsert(events: [settled], isLocal: source == .local)
            }
        } catch {}
    }

    public func deleteOptimistic(id: EventId, scope: EventDeleteScope) async throws {
        beginMutation()
        defer { endMutation() }
        try repository.delete(ids: [id])
        do {
            try await eventsAPI.delete(id: id, scope: scope)
        } catch {}
    }

    public func rsvpOptimistic(
        id: EventId,
        input: RsvpEventInput,
        optimisticEvent: Event
    ) async throws {
        beginMutation()
        defer { endMutation() }
        try repository.upsert(events: [optimisticEvent], isLocal: source == .local)
        do {
            try await eventsAPI.rsvp(id: id, input: input)
        } catch {}
    }

    private func beginMutation() {
        inFlightMutations += 1
    }

    private func endMutation() {
        inFlightMutations = max(inFlightMutations - 1, 0)
        if inFlightMutations == 0 {
            flushInvalidation()
        } else {
            owedInvalidation = true
        }
    }

    private func flushInvalidation() {
        owedInvalidation = false
        try? applyInvalidation(targets: [.events])
    }

    private func applyInvalidation(targets: Set<QueryInvalidationTarget>) throws {
        try QueryInvalidator.apply(targets, rangeCache: rangeCache)
    }

    private func eventsInRange(key: EventRangeQueryKey) throws -> [Event] {
        let all = try repository.fetchAll()
        return all.filter { event in
            guard let bounds = try? EventScheduleBounds.bounds(for: event) else {
                return false
            }
            return bounds.startsAt >= key.start && bounds.endsAt <= key.end
        }
    }

    private struct RecurringReplaceSnapshot: Sendable {
        let original: Event
        let seriesEvents: [Event]
        let seriesMaster: Event?
    }

    private func recurringReplaceSnapshot(targetId: EventId) throws -> RecurringReplaceSnapshot? {
        guard let original = try repository.fetch(id: targetId) else { return nil }
        guard case .occurrence(let payload) = original.recurrence else { return nil }
        let seriesId = payload.seriesId
        let seriesEvents = try seriesOccurrenceSnapshot(seriesId: seriesId, target: original)
        let seriesMaster = try repository.fetch(id: seriesId)
        return RecurringReplaceSnapshot(
            original: original,
            seriesEvents: seriesEvents,
            seriesMaster: seriesMaster
        )
    }

    private func seriesOccurrenceSnapshot(seriesId: EventId, target: Event) throws -> [Event] {
        var events = try repository.occurrences(forSeriesId: seriesId)
        if events.isEmpty {
            events = try repository.fetchAll().filter { event in
                guard case .occurrence(let payload) = event.recurrence else { return false }
                return payload.seriesId == seriesId
            }
        }
        if !events.contains(where: { $0.id == target.id }) {
            events.append(target)
        }
        return events
    }

    private func recurringReplaceProjection(
        input: ReplaceEventInput,
        edited: Event,
        snapshot: RecurringReplaceSnapshot
    ) -> RecurringEditProjection? {
        guard input.scope != .this else { return nil }
        return ProjectRecurringEdit.projectRecurringEdit(
            .init(
                scope: input.scope,
                edited: edited,
                original: snapshot.original,
                seriesEvents: snapshot.seriesEvents,
                seriesMaster: snapshot.seriesMaster
            )
        )
    }

    private func applyRecurringProjection(
        _ projection: RecurringEditProjection,
        edited: Event
    ) throws {
        if !projection.removeIds.isEmpty {
            let ids = projection.removeIds.map { EventId(rawValue: $0) }
            try repository.delete(ids: ids)
        }
        let upserts = nativeOptimisticUpserts(from: projection, edited: edited)
        if !upserts.isEmpty {
            try repository.upsert(events: upserts, isLocal: source == .local)
        }
    }

    /// Native GRDB holds materialized rows only; drop superseded occurrence ids that
    /// projection removes and let the next range read re-expand the remainder series.
    private func nativeOptimisticUpserts(
        from projection: RecurringEditProjection,
        edited: Event
    ) -> [Event] {
        projection.upserts.filter { event in
            switch event.recurrence {
            case .series:
                return true
            case .occurrence:
                if projection.removeIds.contains(event.id.rawValue) {
                    return event.id == edited.id
                }
                return true
            case .single:
                return true
            }
        }
    }
}
