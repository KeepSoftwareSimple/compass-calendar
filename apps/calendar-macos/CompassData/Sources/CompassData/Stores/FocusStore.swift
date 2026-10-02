// Mirrors `apps/calendar-web/src/grid/interaction/view-event-registry.ts`,
// `apps/calendar-web/src/grid/shortcuts/edge-focus.store.ts`, and
// `apps/calendar-web/src/shortcuts/page-jump/page-jump.store.ts` / targets.

import CompassKit
import Foundation

public enum EventEdge: String, Sendable, Hashable {
    case startDate
    case endDate
}

public struct PageJumpTarget: Sendable, Hashable, Identifiable {
    public var id: String
    public var digit: String
    public var label: String

    public init(id: String, digit: String, label: String) {
        self.id = id
        self.digit = digit
        self.label = label
    }
}

@MainActor
@Observable
public final class FocusStore {
    public var view: CalendarGridView
    private var registries: [CalendarGridView: EventRegistry]
    public private(set) var focusedEventId: EventId?
    public private(set) var focusedEventType: ViewInteractionEventType?
    public private(set) var edge: EventEdge?
    public private(set) var edgeAnnouncement: String = ""
    public private(set) var pageJumpTargets: [PageJumpTarget] = []
    public var pageJumpHintsVisible = false

    private var registrationCounter = 0

    public init(view: CalendarGridView = .week) {
        self.view = view
        self.registries = [
            .day: EventRegistry(),
            .week: EventRegistry(),
        ]
    }

    public func registry(for view: CalendarGridView? = nil) -> EventRegistry {
        let key = view ?? self.view
        if registries[key] == nil {
            registries[key] = EventRegistry()
        }
        return registries[key]!
    }

    public func clearRegistry(for view: CalendarGridView? = nil) {
        registry(for: view).clear()
    }

    public func register(
        eventId: EventId,
        eventType: ViewInteractionEventType,
        view: CalendarGridView? = nil
    ) {
        registrationCounter += 1
        let target = RegisteredEventTarget(
            eventId: eventId,
            eventType: eventType,
            order: registrationCounter
        )
        registry(for: view).register(target)
    }

    public func setFocused(eventId: EventId?, eventType: ViewInteractionEventType?) {
        focusedEventId = eventId
        focusedEventType = eventType
        if eventId == nil {
            edge = nil
            edgeAnnouncement = ""
        }
    }

    public func cycleEdge(for eventId: EventId, direction: CycleDirection) {
        let cycle: [EventEdge?] = [nil, .startDate, .endDate]
        let currentEdge: EventEdge? =
            focusedEventId == eventId ? edge : nil
        let index = cycle.firstIndex(where: { $0 == currentEdge }) ?? 0
        let step = direction == .forward ? 1 : -1
        let nextIndex = (index + step + cycle.count) % cycle.count
        let next = cycle[nextIndex]
        focusedEventId = eventId
        edge = next
        edgeAnnouncement = Self.edgeAnnouncement(next)
    }

    public func setEdge(eventId: EventId, edge: EventEdge, announcement: String) {
        focusedEventId = eventId
        self.edge = edge
        edgeAnnouncement = announcement
    }

    public func resetEdgeFocus() {
        focusedEventId = nil
        focusedEventType = nil
        edge = nil
        edgeAnnouncement = ""
    }

    public func setPageJumpTargets(_ targets: [PageJumpTarget]) {
        pageJumpTargets = targets
    }

    public func setPageJumpHintsVisible(_ visible: Bool) {
        pageJumpHintsVisible = visible
    }

    /// Tab order through the active view registry.
    public func navigableEventOrder() -> [RegisteredEventTarget] {
        registry().navigableTargets()
    }

    public enum CycleDirection: Sendable {
        case forward
        case backward
    }

    private static func edgeAnnouncement(_ edge: EventEdge?) -> String {
        switch edge {
        case .startDate:
            "Editing start time"
        case .endDate:
            "Editing end time"
        case nil:
            "Editing whole event"
        }
    }
}
