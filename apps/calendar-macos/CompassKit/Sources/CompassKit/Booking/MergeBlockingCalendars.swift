import Foundation

public enum MergeBlockingCalendars {
    private static func sameCalendarIdSet(_ left: [String], _ right: [String]) -> Bool {
        guard left.count == right.count else { return false }
        let rightIds = Set(right)
        return left.allSatisfy { rightIds.contains($0) }
    }

    private static func appendUniqueIds(
        start: [String],
        candidates: [String],
        skip: Set<String>
    ) -> [String] {
        var next = start
        var seen = Set(start)
        for calendarId in candidates {
            if skip.contains(calendarId) || seen.contains(calendarId) { continue }
            seen.insert(calendarId)
            next.append(calendarId)
        }
        return next
    }

    public static func mergeDiscoveredBlockingCalendarIds(
        current: [String],
        optedOut: [String],
        discovered: [String]
    ) -> [String] {
        appendUniqueIds(
            start: current,
            candidates: discovered,
            skip: Set(optedOut)
        )
    }

    public static func nextOptedOutBlockingCalendarIds(
        previousOptedOut: [String],
        eligible: [String],
        submitted: [String]
    ) -> [String] {
        appendUniqueIds(
            start: [],
            candidates: previousOptedOut + eligible,
            skip: Set(submitted)
        )
    }

    public static func withDiscoveredBlockingCalendarIds(
        blockingCalendarIds: [String],
        optedOut: [String],
        discovered: [String]
    ) -> [String]? {
        let merged = mergeDiscoveredBlockingCalendarIds(
            current: blockingCalendarIds,
            optedOut: optedOut,
            discovered: discovered
        )
        if sameCalendarIdSet(merged, blockingCalendarIds) { return nil }
        return merged
    }
}
