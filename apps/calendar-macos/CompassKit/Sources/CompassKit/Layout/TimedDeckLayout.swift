import Foundation

/// Where an overlapping card sits inside its column. `left` and `width` are
/// fractions of the usable column width; `zIndex` is paint order within the
/// group and `groupSize` lets a selected card be raised above every partner.
/// Mirrors web `timed-deck.layout.ts`.
public struct TimedDeckLayout: Hashable, Sendable, Codable {
    public var groupSize: Int
    public var left: Double
    public var width: Double
    public var zIndex: Int

    public init(groupSize: Int, left: Double, width: Double, zIndex: Int) {
        self.groupSize = groupSize
        self.left = left
        self.width = width
        self.zIndex = zIndex
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
    /// Events starting within `deckNearStartMinutes` of each other share the
    /// row side by side; a later start is drawn over the earlier card,
    /// indented, so the earlier title stays readable above it.
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
                      let parsedEnd = CompassDateParsing.parseInEffectiveTimeZone(event.endDate)
                else {
                    return nil
                }
                let end = gridOverlapIntervalEnd(start: start, end: parsedEnd)
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
                for (itemIndex, layout) in placeGroup(orderBackgroundFirst(group)) {
                    items[itemIndex].deckLayout = layout
                }
            }
        }

        return items
    }

    public static func elevateTimedDeckZIndex(
        deckLayout: TimedDeckLayout,
        zIndex: Int
    ) -> Int {
        max(zIndex, deckLayout.groupSize + deckLayout.zIndex)
    }

    public static func applyTimedEventDisplayPosition(
        _ position: EventPosition,
        deckLayout: TimedDeckLayout?,
        isHidden: Bool = false
    ) -> EventPosition {
        if isHidden {
            return applyHiddenEventStripWidth(position)
        }

        guard let deckLayout else {
            var next = position
            next.width = getTimedEventCardWidth(position.width)
            return next
        }

        return EventPosition(
            height: position.height,
            left: position.left + deckLayout.left * position.width,
            top: position.top,
            width: deckLayout.width * position.width,
            zIndex: deckLayout.zIndex
        )
    }

    private static func placeGroup(_ sorted: [DeckCandidate]) -> [(Int, TimedDeckLayout)] {
        var placed: [PlacedCard] = []
        var layouts: [(Int, TimedDeckLayout)] = []
        var index = 0

        while index < sorted.count {
            let batch = takeBatch(sorted, from: index)
            let (left, right) = batchSpan(batch, placed: placed)
            let width = (right - left) / Double(batch.count)

            for (slot, candidate) in batch.enumerated() {
                let card = PlacedCard(candidate: candidate, left: left + Double(slot) * width, width: width)
                placed.append(card)
                layouts.append((
                    candidate.itemIndex,
                    TimedDeckLayout(
                        groupSize: sorted.count,
                        left: card.left,
                        width: width,
                        zIndex: placed.count
                    )
                ))
            }

            index += batch.count
        }

        return layouts
    }

    /// Consecutive sorted events that start close to the first and overlap it.
    private static func takeBatch(_ sorted: [DeckCandidate], from: Int) -> [DeckCandidate] {
        var batch = [sorted[from]]
        var next = from + 1
        while next < sorted.count {
            let candidate = sorted[next]
            let startsNear = isNearStart(sorted[from], candidate)
            guard startsNear, batch.contains(where: { overlaps($0, candidate) }) else { break }
            batch.append(candidate)
            next += 1
        }
        return batch
    }

    /// Horizontal span for a batch as [left, right) fractions. Cards that
    /// started well before the batch are cascaded over; cards that started
    /// near the batch must not be covered, so the batch takes the free space
    /// beside them.
    private static func batchSpan(_ batch: [DeckCandidate], placed: [PlacedCard]) -> (Double, Double) {
        let first = batch[0]
        let touching = placed.filter { card in
            batch.contains(where: { overlaps($0, card.candidate) })
        }
        let far = touching.filter { !isNearStart($0.candidate, first) }
        let near = touching.filter { isNearStart($0.candidate, first) }

        let left = far.reduce(0.0) { edge, card in
            max(edge, card.left + GridLayoutConstants.deckCascadeIndentRatio)
        }
        guard !near.isEmpty else { return (left, 1) }

        let nearLeft = near.map(\.left).min() ?? 0
        if nearLeft > left { return (left, nearLeft) }

        let nearRight = near.map { $0.left + $0.width }.max() ?? 1
        if nearRight < 1 { return (nearRight, 1) }

        return (left, 1)
    }

    private static func isNearStart(_ earlier: DeckCandidate, _ later: DeckCandidate) -> Bool {
        // Whole minutes, matching dayjs `diff(..., "minute")` truncation.
        let minutes = Int(later.start.timeIntervalSince(earlier.start) / 60)
        return minutes < GridLayoutConstants.deckNearStartMinutes
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
}

private struct DeckCandidate {
    var dayKey: String
    var start: Date
    var end: Date
    var itemIndex: Int
}

private struct PlacedCard {
    var candidate: DeckCandidate
    var left: Double
    var width: Double
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

/// Match web `gridOverlapIntervalEnd`: group on the painted span, which is at
/// least the timed card minimum duration.
private func gridOverlapIntervalEnd(start: Date, end: Date) -> Date {
    let minimum = Double(GridLayoutConstants.timedEventMinDurationMinutes * 60)
    guard end.timeIntervalSince(start) < minimum else { return end }
    return start.addingTimeInterval(minimum)
}

private func orderBackgroundFirst(_ group: [DeckCandidate]) -> [DeckCandidate] {
    group.sorted { lhs, rhs in
        if lhs.start != rhs.start {
            return lhs.start < rhs.start
        }
        return lhs.end > rhs.end
    }
}
