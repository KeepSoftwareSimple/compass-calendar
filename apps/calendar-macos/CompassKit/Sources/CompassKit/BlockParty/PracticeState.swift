import Foundation

public struct PracticeEventBlock: Hashable, Sendable, Codable {
    public var id: String
    public var title: String
    public var dayIndex: Int
    public var startMin: Int
    public var endMin: Int
    public var color: String?

    public init(
        id: String,
        title: String,
        dayIndex: Int,
        startMin: Int,
        endMin: Int,
        color: String? = nil
    ) {
        self.id = id
        self.title = title
        self.dayIndex = dayIndex
        self.startMin = startMin
        self.endMin = endMin
        self.color = color
    }
}

public enum PracticeNudgeDirection: String, Sendable, Codable {
    case up, down, left, right
}

public enum PracticeEdge: String, Sendable, Codable {
    case start, end
}

public struct PracticeState: Hashable, Sendable {
    public var events: [PracticeEventBlock]
    public var focusedId: String?
    public var placingId: String?
    public var edge: PracticeEdge?
    public var lastDeleted: PracticeEventBlock?

    public init(
        events: [PracticeEventBlock],
        focusedId: String? = nil,
        placingId: String? = nil,
        edge: PracticeEdge? = nil,
        lastDeleted: PracticeEventBlock? = nil
    ) {
        self.events = events
        self.focusedId = focusedId
        self.placingId = placingId
        self.edge = edge
        self.lastDeleted = lastDeleted
    }
}

public enum PracticeGridConstants {
    public static let showcaseGridStartHour = 8
    public static let showcaseGridEndHour = 18
    public static let showcaseDayCount = 3
    public static let practiceNudgeMin = 15
    public static let practiceGridStartMin = showcaseGridStartHour * 60
    public static let practiceGridEndMin = showcaseGridEndHour * 60
}

public enum PracticeStateEngine {
    public static func create(events: [PracticeEventBlock]) -> PracticeState {
        PracticeState(events: events)
    }

    public static func spawnPiece(_ state: PracticeState, piece: PracticeEventBlock) -> PracticeState {
        var next = state
        next.events = state.events.filter { $0.id != piece.id } + [piece]
        next.focusedId = piece.id
        next.placingId = piece.id
        next.edge = nil
        return next
    }

    public static func lockPlacing(_ state: PracticeState) -> PracticeState {
        guard state.placingId != nil else { return state }
        var next = state
        next.placingId = nil
        return next
    }

    public static func focusEvent(_ state: PracticeState, id: String) -> PracticeState {
        guard state.events.contains(where: { $0.id == id }) else { return state }
        var next = state
        next.focusedId = id
        next.placingId = nil
        next.edge = nil
        return next
    }

    public static func ensureFocused(_ state: PracticeState) -> PracticeState {
        if let focusedId = state.focusedId,
           state.events.contains(where: { $0.id == focusedId })
        {
            return state
        }
        guard let fallback = state.events.first else { return state }
        var next = state
        next.focusedId = fallback.id
        next.edge = nil
        return next
    }

    private static func nudgeFocusedEdge(
        event: PracticeEventBlock,
        edge: PracticeEdge,
        direction: PracticeNudgeDirection
    ) -> PracticeEventBlock? {
        if direction == .left || direction == .right { return nil }
        let delta = direction == .down ? PracticeGridConstants.practiceNudgeMin : -PracticeGridConstants.practiceNudgeMin
        if edge == .start {
            let startMin = max(
                PracticeGridConstants.practiceGridStartMin,
                min(event.endMin - PracticeGridConstants.practiceNudgeMin, event.startMin + delta)
            )
            if startMin == event.startMin { return nil }
            var next = event
            next.startMin = startMin
            return next
        }
        let endMin = min(
            PracticeGridConstants.practiceGridEndMin,
            max(event.startMin + PracticeGridConstants.practiceNudgeMin, event.endMin + delta)
        )
        if endMin == event.endMin { return nil }
        var next = event
        next.endMin = endMin
        return next
    }

    public static func nudgeFocused(
        _ state: PracticeState,
        direction: PracticeNudgeDirection
    ) -> PracticeState {
        let focused = ensureFocused(state)
        guard let focusedId = focused.focusedId else { return state }

        var moved = false
        let events = focused.events.map { event -> PracticeEventBlock in
            guard event.id == focusedId else { return event }
            if let edge = focused.edge {
                guard let next = nudgeFocusedEdge(event: event, edge: edge, direction: direction) else {
                    return event
                }
                moved = true
                return next
            }
            if direction == .left || direction == .right {
                let dayIndex = max(
                    0,
                    min(
                        PracticeGridConstants.showcaseDayCount - 1,
                        event.dayIndex + (direction == .right ? 1 : -1)
                    )
                )
                if dayIndex == event.dayIndex { return event }
                moved = true
                var next = event
                next.dayIndex = dayIndex
                return next
            }
            let duration = event.endMin - event.startMin
            let delta = direction == .down ? PracticeGridConstants.practiceNudgeMin : -PracticeGridConstants.practiceNudgeMin
            let startMin = max(
                PracticeGridConstants.practiceGridStartMin,
                min(PracticeGridConstants.practiceGridEndMin - duration, event.startMin + delta)
            )
            if startMin == event.startMin { return event }
            moved = true
            var next = event
            next.startMin = startMin
            next.endMin = startMin + duration
            return next
        }

        if !moved { return focused == state ? state : focused }
        var next = focused
        next.events = events
        return next
    }

    private static let edgeCycle: [PracticeEdge?] = [nil, .start, .end]

    public static func cycleEdgeFocus(
        _ state: PracticeState,
        direction: CycleDirection
    ) -> PracticeState {
        let focused = ensureFocused(state)
        guard focused.focusedId != nil else { return state }
        let index = edgeCycle.firstIndex(where: { $0 == focused.edge }) ?? 0
        let step = direction == .forward ? 1 : -1
        let nextIndex = (index + step + edgeCycle.count) % edgeCycle.count
        var next = focused
        next.edge = edgeCycle[nextIndex]
        return next
    }

    public enum CycleDirection: Sendable {
        case forward, backward
    }

    public static func deleteFocused(_ state: PracticeState) -> PracticeState {
        let focused = ensureFocused(state)
        guard let focusedId = focused.focusedId else { return state }
        guard let deleted = focused.events.first(where: { $0.id == focusedId }) else { return state }
        let events = focused.events.filter { $0.id != focusedId }
        var next = focused
        next.events = events
        next.focusedId = events.first?.id
        next.placingId = nil
        next.lastDeleted = deleted
        next.edge = nil
        return next
    }

    public static func undoDelete(_ state: PracticeState) -> PracticeState {
        guard let restored = state.lastDeleted else { return state }
        var next = state
        next.events = state.events + [restored]
        next.focusedId = restored.id
        next.lastDeleted = nil
        next.edge = nil
        return next
    }
}
