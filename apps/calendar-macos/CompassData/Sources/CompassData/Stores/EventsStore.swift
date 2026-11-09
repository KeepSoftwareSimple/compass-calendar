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

    private var remoteSessionRevision = 0
    private var remoteSessionReady = true

    private let repository: EventRepository
    private let localEvents: LocalEventRepository
    private let rangeCache: RangeCache
    private let eventsAPI: EventsAPIProtocol
    private let systemCalendarConnector: SystemCalendarConnector
    public private(set) var source: EventRepositorySource
    /// Runs once a create, replace, or delete has landed (web `writeAfterPreceding`
    /// reporting `wrote`). `isNewCreate` is false for undo restores.
    public var onWriteLanded: ((_ isNewCreate: Bool) -> Void)?

    public init(
        repository: EventRepository,
        localEvents: LocalEventRepository,
        rangeCache: RangeCache,
        eventsAPI: EventsAPIProtocol,
        source: EventRepositorySource = .remote,
        systemCalendarConnector: SystemCalendarConnector = SystemCalendarConnector()
    ) {
        self.repository = repository
        self.localEvents = localEvents
        self.rangeCache = rangeCache
        self.eventsAPI = eventsAPI
        self.systemCalendarConnector = systemCalendarConnector
        self.source = source
    }

    /// Discard refetchable account caches and invalidate responses from the prior session.
    public func resetRemoteSession() throws {
        remoteSessionRevision += 1
        remoteSessionReady = false
        try repository.clearRemote()
        try rangeCache.clear()
        remoteSessionReady = true
    }

    public func removeCachedEvents(forCalendarIds calendarIds: Set<String>) throws {
        guard source == .remote, !calendarIds.isEmpty else { return }
        guard remoteSessionReady else { throw CancellationError() }
        // Responses started before the authoritative calendar change cannot restore removed events.
        remoteSessionRevision += 1
        let obsolete = try repository.fetchAll().filter { calendarIds.contains($0.calendarId.rawValue) }
        try repository.delete(ids: obsolete.map(\.id))
        try rangeCache.clear()
    }

    public func setSource(_ source: EventRepositorySource) {
        self.source = source
    }

    public func handleServerMessage(_ message: ServerMessage) throws {
        let targets = QueryInvalidator.invalidations(for: message)
        try applyInvalidation(targets: targets)
    }

    func invalidateRanges() throws {
        try applyInvalidation(targets: [.events])
    }

    public func handleStreamReopen() throws {
        try applyInvalidation(targets: QueryInvalidator.streamReopenInvalidations())
    }

    public func coverage(for key: EventRangeQueryKey) throws -> RangeCoverage {
        try rangeCache.coverage(for: key)
    }

    public func fetchAllEvents() throws -> [Event] {
        if source == .local {
            return try localEvents.expandedRecords().map(\.event)
        }
        guard remoteSessionReady else { throw CancellationError() }
        return try repository.fetchAll()
    }

    public func loadRange(key: EventRangeQueryKey) async throws -> [Event] {
        if source == .local {
            let events = try localEvents.events(intersectingStart: key.start, end: key.end)
            try rangeCache.markLoaded(key: key)
            return events
        }

        guard remoteSessionReady else { throw CancellationError() }
        let revision = remoteSessionRevision
        let coverage = try rangeCache.coverage(for: key)
        if case .fresh = coverage {
            return try eventsInRange(key: key)
        }

        let query = EventListQuery(
            kind: "timed",
            start: key.start,
            end: key.end
        )
        let events: [Event]
        do {
            events = try await eventsAPI.list(query)
        } catch let error as URLError {
            guard revision == remoteSessionRevision, remoteSessionReady else { throw CancellationError() }
            guard !Task.isCancelled, case .stale = coverage,
                  try rangeCache.coverage(for: key) == coverage,
                  [.notConnectedToInternet, .networkConnectionLost, .timedOut,
                   .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed].contains(error.code)
            else { throw error }
            // Keep the old coverage timestamp so the next load still retries.
            return try eventsInRange(key: key)
        }
        guard revision == remoteSessionRevision else { throw CancellationError() }
        let systemEvents = try systemCalendarEvents(for: key)
        let merged = events + systemEvents
        try repository.upsert(events: merged, isLocal: false)
        try repository.pruneRemoteEvents(
            intersectingStart: key.start,
            end: key.end,
            retaining: Set(merged.map(\.id))
        )
        try rangeCache.markLoaded(key: key)
        return try eventsInRange(key: key)
    }

    private func systemCalendarEvents(for key: EventRangeQueryKey) throws -> [Event] {
        guard SystemCalendarConnectionStore.isConnected else { return [] }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var start = formatter.date(from: key.start)
        var end = formatter.date(from: key.end)
        if start == nil || end == nil {
            formatter.formatOptions = [.withInternetDateTime]
            start = formatter.date(from: key.start)
            end = formatter.date(from: key.end)
        }
        guard let start, let end else { return [] }
        return systemCalendarConnector.fetchEvents(start: start, end: end)
    }

    /// Synchronous optimistic insert for keyboard-place saves (XCUITest must see undo before async work).
    public func stageOptimisticCreate(_ optimisticEvent: Event) throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            let record = LocalEventRecord(id: optimisticEvent.id, event: optimisticEvent, isDemo: false)
            try localEvents.put(record)
            onWriteLanded?(true)
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
        let revision = remoteSessionRevision
        do {
            let response = try await eventsAPI.create(input)
            guard revision == remoteSessionRevision else { return }
            onWriteLanded?(input.restore != true)
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
        optimisticEvent: Event,
        onOptimisticCacheUpdated: (@Sendable (_ events: [Event]) -> Void)? = nil
    ) async throws {
        beginMutation()
        defer { endMutation() }
        let isNewCreate = input.restore != true
        if source == .local {
            let record = LocalEventRecord(id: optimisticEvent.id, event: optimisticEvent, isDemo: false)
            try localEvents.put(record)
            onOptimisticCacheUpdated?(try fetchAllEvents())
            onWriteLanded?(isNewCreate)
            return
        }
        try repository.upsert(events: [optimisticEvent], isLocal: false)
        onOptimisticCacheUpdated?(try fetchAllEvents())
        let revision = remoteSessionRevision
        do {
            let response = try await eventsAPI.create(input)
            guard revision == remoteSessionRevision else { return }
            onWriteLanded?(isNewCreate)
            let settled = try EventMapping.event(from: response)
            try repository.upsert(events: [settled], isLocal: false)
        } catch {
            // Locked desktop decision: no rollback; settle invalidates ranges.
        }
    }

    public func replaceOptimistic(
        id: EventId,
        input: ReplaceEventInput,
        optimisticEvent: Event,
        onOptimisticCacheUpdated: (@Sendable (_ events: [Event]) -> Void)? = nil
    ) async throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            if try !localEvents.replaceOccurrence(id: id, input: input, edited: optimisticEvent) {
                let snapshot = try localRecurringReplaceSnapshot(targetId: id)
                try applyLocalReplaceCacheUpdate(
                    input: input,
                    edited: optimisticEvent,
                    snapshot: snapshot
                )
            }
            onOptimisticCacheUpdated?(try fetchAllEvents())
            onWriteLanded?(false)
            return
        }
        let snapshot = try recurringReplaceSnapshot(targetId: id)
        try applyReplaceCacheUpdate(
            input: input,
            edited: optimisticEvent,
            snapshot: snapshot
        )
        onOptimisticCacheUpdated?(try fetchAllEvents())
        // Replace returns a command acknowledgement, not an authoritative event.
        // Preserve the optimistic projection until the invalidated range is read.
        if (try? await eventsAPI.replace(id: id, input: input)) != nil {
            onWriteLanded?(false)
        }
    }

    public func deleteOptimistic(id: EventId, scope: EventDeleteScope) async throws {
        beginMutation()
        defer { endMutation() }
        if source == .local {
            if try !localEvents.deleteOccurrence(id: id, scope: scope) {
                let snapshot = try localRecurringDeleteSnapshot(targetId: id)
                try applyLocalDeleteCacheUpdate(id: id, scope: scope, snapshot: snapshot)
            }
            onWriteLanded?(false)
            return
        }
        let snapshot = try recurringDeleteSnapshot(targetId: id)
        try applyDeleteCacheUpdate(id: id, scope: scope, snapshot: snapshot)
        do {
            try await eventsAPI.delete(id: id, scope: scope)
            onWriteLanded?(false)
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

    private struct RecurringDeleteSnapshot: Sendable {
        let target: Event
        let seriesId: EventId
        let seriesEvents: [Event]
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
    private func recurringDeleteSnapshot(targetId: EventId) throws -> RecurringDeleteSnapshot? {
        guard let target = try repository.fetch(id: targetId) else { return nil }
        let seriesId: EventId
        switch target.recurrence {
        case .occurrence(let payload):
            seriesId = payload.seriesId
        case .series:
            seriesId = target.id
        case .single:
            return nil
        }
        let seriesEvents = try seriesOccurrenceSnapshot(seriesId: seriesId, target: target)
        return RecurringDeleteSnapshot(
            target: target,
            seriesId: seriesId,
            seriesEvents: seriesEvents
        )
    }

    private func applyDeleteCacheUpdate(
        id: EventId,
        scope: EventDeleteScope,
        snapshot: RecurringDeleteSnapshot?
    ) throws {
        guard let snapshot, scope != .this else {
            try repository.delete(ids: [id])
            return
        }
        let scopeEnum = ScopeEnum(rawValue: scope.rawValue) ?? .this
        let projection = ProjectRecurringEdit.projectRecurringDelete(
            scope: scopeEnum,
            target: snapshot.target,
            seriesId: snapshot.seriesId,
            seriesEvents: snapshot.seriesEvents
        )
        if !projection.removeIds.isEmpty {
            let ids = projection.removeIds.map { EventId(rawValue: $0) }
            try repository.delete(ids: ids)
        }
    }

    private func localRecurringReplaceSnapshot(targetId: EventId) throws -> RecurringReplaceSnapshot? {
        guard let original = try localEvent(id: targetId)?.event else { return nil }
        guard case .occurrence(let payload) = original.recurrence else { return nil }
        let seriesId = payload.seriesId
        let seriesEvents = try localSeriesOccurrenceSnapshot(seriesId: seriesId, target: original)
        let seriesMaster = try localEvent(id: seriesId)?.event
        return RecurringReplaceSnapshot(
            original: original,
            seriesEvents: seriesEvents,
            seriesMaster: seriesMaster
        )
    }

    private func localRecurringDeleteSnapshot(targetId: EventId) throws -> RecurringDeleteSnapshot? {
        guard let target = try localEvent(id: targetId)?.event else { return nil }
        let seriesId: EventId
        switch target.recurrence {
        case .occurrence(let payload):
            seriesId = payload.seriesId
        case .series:
            seriesId = target.id
        case .single:
            return nil
        }
        let seriesEvents = try localSeriesOccurrenceSnapshot(seriesId: seriesId, target: target)
        return RecurringDeleteSnapshot(
            target: target,
            seriesId: seriesId,
            seriesEvents: seriesEvents
        )
    }

    private func localEvent(id: EventId) throws -> LocalEventRecord? {
        try localEvents.fetchAll().first { $0.id == id }
    }

    private func localSeriesOccurrenceSnapshot(seriesId: EventId, target: Event) throws -> [Event] {
        let all = try localEvents.fetchAll().map(\.event)
        var events = all.filter { event in
            switch event.recurrence {
            case .occurrence(let payload):
                return payload.seriesId == seriesId
            case .series:
                return event.id == seriesId
            case .single:
                return false
            }
        }
        if !events.contains(where: { $0.id == target.id }) {
            events.append(target)
        }
        return events
    }

    private func applyLocalReplaceCacheUpdate(
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
            try applyLocalRecurringProjection(projection, edited: edited)
        } else {
            try putLocalEvent(edited)
        }
    }

    private func applyLocalDeleteCacheUpdate(
        id: EventId,
        scope: EventDeleteScope,
        snapshot: RecurringDeleteSnapshot?
    ) throws {
        guard let snapshot, scope != .this else {
            try localEvents.delete(id: id)
            return
        }
        let scopeEnum = ScopeEnum(rawValue: scope.rawValue) ?? .this
        let projection = ProjectRecurringEdit.projectRecurringDelete(
            scope: scopeEnum,
            target: snapshot.target,
            seriesId: snapshot.seriesId,
            seriesEvents: snapshot.seriesEvents
        )
        if !projection.removeIds.isEmpty {
            let ids = projection.removeIds.map { EventId(rawValue: $0) }
            try localEvents.delete(ids: ids)
        }
    }

    private func applyLocalRecurringProjection(
        _ projection: RecurringEditProjection,
        edited: Event
    ) throws {
        if !projection.removeIds.isEmpty {
            let ids = projection.removeIds.map { EventId(rawValue: $0) }
            try localEvents.delete(ids: ids)
        }
        let upserts = nativeOptimisticUpserts(from: projection, edited: edited)
        if !upserts.isEmpty {
            try putLocalEvents(upserts)
        }
    }

    private func localRecord(for event: Event, previous: LocalEventRecord?) -> LocalEventRecord {
        LocalEventRecord(
            id: event.id,
            event: event,
            isDemo: previous?.isDemo ?? false,
            exdates: previous?.exdates
        )
    }

    private func putLocalEvent(_ event: Event) throws {
        try localEvents.put(localRecord(for: event, previous: try localEvent(id: event.id)))
    }

    private func putLocalEvents(_ events: [Event]) throws {
        let recordsById = Dictionary(
            uniqueKeysWithValues: try localEvents.fetchAll().map { ($0.id, $0) }
        )
        try localEvents.putMany(events.map { localRecord(for: $0, previous: recordsById[$0.id]) })
    }

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
