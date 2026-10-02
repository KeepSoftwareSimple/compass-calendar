import Foundation

public struct FocusLayoutCard: Hashable, Sendable {
    public var eventId: String
    public var frame: EventPosition
    public var isAllDay: Bool

    public init(eventId: String, frame: EventPosition, isAllDay: Bool) {
        self.eventId = eventId
        self.frame = frame
        self.isAllDay = isAllDay
    }
}

public enum FocusMoveDirection: Sendable {
    case up
    case down
    case left
    case right
}

/// Spatial focus adjacency for week/day grids (parity with web arrow focus).
public enum GridFocusNavigator {
    public static func adjacent(
        focused: FocusLayoutCard,
        direction: FocusMoveDirection,
        candidates: [FocusLayoutCard],
        layoutMode: GridLayoutMode
    ) -> FocusLayoutCard? {
        let others = candidates.filter { $0.eventId != focused.eventId }
        guard !others.isEmpty else { return nil }

        if layoutMode == .day {
            return chronologicalAdjacent(
                focused: focused,
                direction: direction,
                candidates: others
            )
        }

        switch direction {
        case .up, .down:
            return verticalAdjacent(focused: focused, direction: direction, candidates: others)
        case .left, .right:
            return horizontalAdjacent(focused: focused, direction: direction, candidates: others)
        }
    }

    private static func chronologicalAdjacent(
        focused: FocusLayoutCard,
        direction: FocusMoveDirection,
        candidates: [FocusLayoutCard]
    ) -> FocusLayoutCard? {
        let forward = direction == .down || direction == .right
        let sorted = candidates.sorted { lhs, rhs in
            if lhs.frame.top != rhs.frame.top { return lhs.frame.top < rhs.frame.top }
            return lhs.frame.left < rhs.frame.left
        }
        guard let index = sorted.firstIndex(where: { $0.eventId == focused.eventId }) else {
            return forward ? sorted.first : sorted.last
        }
        let nextIndex = forward ? index + 1 : index - 1
        guard sorted.indices.contains(nextIndex) else { return nil }
        return sorted[nextIndex]
    }

    private static func verticalAdjacent(
        focused: FocusLayoutCard,
        direction: FocusMoveDirection,
        candidates: [FocusLayoutCard]
    ) -> FocusLayoutCard? {
        let focusedCenterY = focused.frame.top + focused.frame.height / 2
        let sameColumn = candidates.filter { abs($0.frame.left - focused.frame.left) < 8 }
        let pool = sameColumn.isEmpty ? candidates : sameColumn
        let filtered = pool.filter { card in
            let centerY = card.frame.top + card.frame.height / 2
            return direction == .up ? centerY < focusedCenterY - 1 : centerY > focusedCenterY + 1
        }
        guard !filtered.isEmpty else { return nil }
        return filtered.min { lhs, rhs in
            let lhsDistance = abs((lhs.frame.top + lhs.frame.height / 2) - focusedCenterY)
            let rhsDistance = abs((rhs.frame.top + rhs.frame.height / 2) - focusedCenterY)
            if lhsDistance != rhsDistance { return lhsDistance < rhsDistance }
            return lhs.frame.left < rhs.frame.left
        }
    }

    private static func horizontalAdjacent(
        focused: FocusLayoutCard,
        direction: FocusMoveDirection,
        candidates: [FocusLayoutCard]
    ) -> FocusLayoutCard? {
        let focusedCenterY = focused.frame.top + focused.frame.height / 2
        let focusedCenterX = focused.frame.left + focused.frame.width / 2
        let sameBand = candidates.filter {
            abs(($0.frame.top + $0.frame.height / 2) - focusedCenterY) < max(focused.frame.height, 24) / 2
        }
        let pool = sameBand.isEmpty ? candidates : sameBand
        let filtered = pool.filter { card in
            let centerX = card.frame.left + card.frame.width / 2
            return direction == .left ? centerX < focusedCenterX - 1 : centerX > focusedCenterX + 1
        }
        guard !filtered.isEmpty else { return nil }
        return filtered.min { lhs, rhs in
            let lhsDistance = abs((lhs.frame.left + lhs.frame.width / 2) - focusedCenterX)
            let rhsDistance = abs((rhs.frame.left + rhs.frame.width / 2) - focusedCenterX)
            if lhsDistance != rhsDistance { return lhsDistance < rhsDistance }
            return lhs.frame.top < rhs.frame.top
        }
    }

}
