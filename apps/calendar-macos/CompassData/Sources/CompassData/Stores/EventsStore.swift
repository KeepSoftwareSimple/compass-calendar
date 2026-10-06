// Mirrors `apps/calendar-web/src/events/mutations/useEventMutations.ts`, range
// queries, and SSE invalidation via `QueryInvalidator`.

import CompassKit
import Foundation

public protocol EventsAPIProtocol: Sendable {
    func list(_ query: EventListQuery) async throws -> [Event]
    func create(_ input: CreateEventInput) async throws -> EventResponseEvent
    func replace(id: EventId, input: ReplaceEventInput) async throws -> EventResponseEvent
    func delete(id: EventId, scope: EventDeleteScope) async throws
    func rsvp(id: EventId, responseStatus: ResponseStatusEnum, scope: String) async throws
}

extension EventsAPI: EventsAPIProtocol {}

@MainActor
@Observable
public final class EventsStore {
    public private(set) var inFlightMutations = 0
    public private(set) var owedInvalidation = false

    private let repository: EventRepository
    private let localEvents: LocalEventRepository
    private let rangeCache: RangeCache
    private let eventsAPI: EventsAPIProtocol
    public private(set) var source: EventRepositorySource

    public init(
        repository: EventRepository,
        localEvents: LocalEventRepository,
        rangeCache: RangeCache,
        eventsAPI: EventsAPIProtocol,
        source: EventRepositorySource = .remote
    ) {
        self.repository = repository
        self.localEvents = localEvents
        self.rangeCache = rangeCache
        self.eventsAPI = eventsAPI
        self.source = source
    }

    public func setSource(_ source: EventRepositorySource) {
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
        if source == .local {
            return try localEvents.fetchAll().map(\.event)
        }
        return try repository.fetchAll()
    }

    public func loadRange(key: EventRangeQueryKey) async throws -> [Event] {
        if source == .local {
            let events = try localEvents.events(intersectingStart: key.start, end: key.end)
            try rangeCache.markLoaded(key: key)
            return events
        }

        let coverage = try rangeCache.coverage(for: key)
        if case .fresh = coverage {
            return try eventsInRange(key: key)
        }

        let query = EventListQuery(
            kind: "timed",
            start: key.start,
            end: key.end
        )
        let events = try await eventsAPI.list(query)
        try repository.upsert(events: events, isLocal: false)
        try repository.pruneRemoteEvents(
            intersectingStart: key.start,
            end: key.end,
            retaining: Set(events.map(\.id))
        )
        try rangeCache.markLoaded(key: key)
        return try eventsInRange(key: key)
    }

    /// Synchronous optimistic insert for keyboard-place saves (XCUITest must see undo before async work).
    public func stageOptimisticCreate(_ optimisticEvent: Event) throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            let record = LocalEventRecord(id: optimisticEvent.id, event: optimisticEvent, isDemo: false)
            try localEvents.put(record)
            return
        }
        try repository.upsert(events: [optimisticEvent], isLocal: false)
    }

    /// Removes an event from local persistence without awaiting the API.
    public func removePersistedEvent(id: EventId) throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            try localEvents.delete(id: id)
            return
        }
        try repository.delete(ids: [id])
    }

    /// API settle only; optimistic row must already be staged locally.
    public func settleStagedCreate(input: CreateEventInput, optimisticEvent: Event) async {
        beginMutation()
        defer { endMutation() }
        guard source != .local else { return }
        do {
            let response = try await eventsAPI.create(input)
            let settled = try EventMapping.event(from: response)
            try repository.upsert(events: [settled], isLocal: false)
        } catch {}
    }

    /// API settle only; optimistic row must already be removed locally.
    public func settleStagedDelete(id: EventId, scope: EventDeleteScope) async {
        beginMutation()
        defer { endMutation() }
        guard source != .local else { return }
        try? await eventsAPI.delete(id: id, scope: scope)
    }

    public func createOptimistic(
        input: CreateEventInput,
        optimisticEvent: Event
    ) async throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            let record = LocalEventRecord(id: optimisticEvent.id, event: optimisticEvent, isDemo: false)
            try localEvents.put(record)
            return
        }
        try repository.upsert(events: [optimisticEvent], isLocal: false)
        do {
            let response = try await eventsAPI.create(input)
            let settled = try EventMapping.event(from: response)
            try repository.upsert(events: [settled], isLocal: false)
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
        if source == .local {
            let record = LocalEventRecord(id: optimisticEvent.id, event: optimisticEvent, isDemo: false)
            try localEvents.put(record)
            return
        }
        let snapshot = try recurringReplaceSnapshot(targetId: id)
        try applyReplaceCacheUpdate(
            input: input,
            edited: optimisticEvent,
            snapshot: snapshot
        )
        do {
            let response = try await eventsAPI.replace(id: id, input: input)
            let settled = try EventMapping.event(from: response)
            try applyReplaceCacheUpdate(
                input: input,
                edited: settled,
                snapshot: snapshot
            )
        } catch {}
    }

    public func deleteOptimistic(id: EventId, scope: EventDeleteScope) async throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            try localEvents.delete(id: id)
            return
        }
        try repository.delete(ids: [id])
        do {
            try await eventsAPI.delete(id: id, scope: scope)
        } catch {}
    }

    public func rsvpOptimistic(
        id: EventId,
        responseStatus: ResponseStatusEnum,
        scope: String,
        optimisticEvent: Event
    ) async throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            return
        }
        try repository.upsert(events: [optimisticEvent], isLocal: false)
        do {
            try await eventsAPI.rsvp(id: id, responseStatus: responseStatus, scope: scope)
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
        if !events.contains(where: { $0.id == target.id }) {
            events.append(target)
        }
        return events
    }

    private func applyReplaceCacheUpdate(
        input: ReplaceEventInput,
        edited: Event,
        snapshot: RecurringReplaceSnapshot?
    ) throws {
        if let snapshot,
           let projection = recurringReplaceProjection(
               input: input,
               edited: edited,
               snapshot: snapshot
           )
        {
            try applyRecurringProjection(projection, edited: edited)
        } else {
            try repository.upsert(events: [edited], isLocal: source == .local)
        }
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
