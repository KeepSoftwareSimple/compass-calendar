import Foundation

public struct TimedDeckLayout: Hashable, Sendable, Codable {
    public var groupSize: Int
    public var order: Int

    public init(groupSize: Int, order: Int) {
        self.groupSize = groupSize
        self.order = order
    }
}

public struct TimedEventLayoutItem: Hashable, Sendable {
    public var deckLayout: TimedDeckLayout?
    public var eventId: String
    public var isHidden: Bool

    public init(deckLayout: TimedDeckLayout?, eventId: String, isHidden: Bool) {
        self.deckLayout = deckLayout
        self.eventId = eventId
        self.isHidden = isHidden
    }
}

public struct TimedDeckEventInput: Hashable, Sendable {
    public var id: String
    public var startDate: String
    public var endDate: String

    public init(id: String, startDate: String, endDate: String) {
        self.id = id
        self.startDate = startDate
        self.endDate = endDate
    }
}

public enum TimedDeckLayoutEngine {
    public static func createTimedEventLayout(
        events: [TimedDeckEventInput],
        hiddenEventIds: Set<String> = []
    ) -> [TimedEventLayoutItem] {
        var items = events.map { event in
            TimedEventLayoutItem(
                deckLayout: nil,
                eventId: event.id,
                isHidden: hiddenEventIds.contains(event.id)
            )
        }

        let candidates = zip(items.indices, events)
            .filter { !items[$0.0].isHidden }
            .compactMap { index, event -> DeckCandidate? in
                guard let start = CompassDateParsing.parseInEffectiveTimeZone(event.startDate),
                      let end = CompassDateParsing.parseInEffectiveTimeZone(event.endDate)
                else {
                    return nil
                }
                return DeckCandidate(
                    dayKey: CompassDateParsing.formatCalendarDay(start),
                    start: start,
                    end: end,
                    itemIndex: index
                )
            }

        for dayBucket in bucketByStartDay(candidates) {
            for group in groupByOverlap(dayBucket) {
                guard group.count >= 2 else { continue }
                let ordered = orderBackgroundFirst(group)
                for (order, candidate) in ordered.enumerated() {
                    items[candidate.itemIndex].deckLayout = TimedDeckLayout(
                        groupSize: group.count,
                        order: order
                    )
                }
            }
        }

        return items
    }

    public static func applyTimedDeckPosition(
        _ position: EventPosition,
        deckLayout: TimedDeckLayout
    ) -> EventPosition {
        applyTimedDeckPositionWithIndent(
            position,
            deckLayout: deckLayout,
            indentMax: GridLayoutConstants.deckIndent
        )
    }

    public static func applyTimedEventDisplayPosition(
        _ position: EventPosition,
        deckLayout: TimedDeckLayout?,
        isHidden: Bool = false
    ) -> EventPosition {
        if isHidden {
            return applyHiddenEventStripWidth(position)
        }

        let cardWidth = getTimedEventCardWidth(position.width)

        guard let deckLayout else {
            var next = position
            next.width = cardWidth
            return next
        }

        let deckWidth = getTimedEventDeckWidth(
            availableWidth: position.width,
            cardWidth: cardWidth,
            groupSize: deckLayout.groupSize
        )

        var base = position
        base.width = deckWidth
        return applyTimedDeckPositionWithIndent(
            base,
            deckLayout: deckLayout,
            indentMax: GridLayoutConstants.timedEventFanIndent
        )
    }

    private static func applyTimedDeckPositionWithIndent(
        _ position: EventPosition,
        deckLayout: TimedDeckLayout,
        indentMax: Double
    ) -> EventPosition {
        let indent = getDeckIndent(
            width: position.width,
            groupSize: deckLayout.groupSize,
            indentMax: indentMax
        )
        let maxIndent = Double(deckLayout.groupSize - 1) * indent
        let fanned = position.width - GridLayoutConstants.deckRightReserve - maxIndent
        let maxWidthWithinColumn = max(0, position.width - maxIndent)
        let width = min(max(GridLayoutConstants.deckMinWidth, fanned), maxWidthWithinColumn)

        return EventPosition(
            height: position.height,
            left: position.left + Double(deckLayout.order) * indent,
            top: position.top,
            width: width,
            zIndex: deckLayout.order + 1
        )
    }

    private static func applyHiddenEventStripWidth(_ position: EventPosition) -> EventPosition {
        var next = position
        next.width = GridLayoutConstants.hiddenEventStripWidth
        return next
    }

    private static func getTimedEventCardWidth(_ availableWidth: Double) -> Double {
        let fluidWidth = availableWidth * GridLayoutConstants.timedEventWidthRatio
        let boundedWidth = max(GridLayoutConstants.timedEventMinWidth, fluidWidth)
        return min(availableWidth, boundedWidth)
    }

    private static func getTimedEventDeckWidth(
        availableWidth: Double,
        cardWidth: Double,
        groupSize: Int
    ) -> Double {
        let extraIndent = max(0, GridLayoutConstants.timedEventFanIndent - GridLayoutConstants.deckIndent)
        let spreadWidth = cardWidth + Double(groupSize - 1) * extraIndent
        let gutteredWidth = max(
            cardWidth,
            availableWidth - GridLayoutConstants.timedEventFanGutter
        )
        return min(availableWidth, spreadWidth, gutteredWidth)
    }

    private static func getDeckIndent(
        width: Double,
        groupSize: Int,
        indentMax: Double
    ) -> Double {
        guard groupSize >= 2 else { return 0 }

        let minimumVisibleWidth =
            width >= GridLayoutConstants.deckMinWidth
                ? GridLayoutConstants.deckMinWidth
                : width / Double(groupSize)
        let maxIndentForMinWidth = max(0, width - minimumVisibleWidth)
        return min(indentMax, maxIndentForMinWidth / Double(groupSize - 1))
    }
}

private struct DeckCandidate {
    var dayKey: String
    var start: Date
    var end: Date
    var itemIndex: Int
}

private func bucketByStartDay(_ events: [DeckCandidate]) -> [[DeckCandidate]] {
    var buckets: [String: [DeckCandidate]] = [:]
    for event in events {
        buckets[event.dayKey, default: []].append(event)
    }
    return Array(buckets.values)
}

private func groupByOverlap(_ events: [DeckCandidate]) -> [[DeckCandidate]] {
    var remaining = events
    var groups: [[DeckCandidate]] = []

    while !remaining.isEmpty {
        var group = [remaining.removeFirst()]
        var grew = true
        while grew {
            grew = false
            var index = remaining.count - 1
            while index >= 0 {
                if group.contains(where: { overlaps($0, remaining[index]) }) {
                    group.append(remaining.remove(at: index))
                    grew = true
                }
                index -= 1
            }
        }
        groups.append(group)
    }

    return groups
}

private func overlaps(_ a: DeckCandidate, _ b: DeckCandidate) -> Bool {
    a.start < b.end && a.end > b.start
}

private func orderBackgroundFirst(_ group: [DeckCandidate]) -> [DeckCandidate] {
    group.sorted { lhs, rhs in
        if lhs.start != rhs.start {
            return lhs.start < rhs.start
        }
        return lhs.end > rhs.end
    }
}
