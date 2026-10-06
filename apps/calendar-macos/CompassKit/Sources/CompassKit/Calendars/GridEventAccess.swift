import Foundation

public enum GridEventAccess {
    public static func isGridEventContentReadOnly(isBusy: Bool, isTimedMultiDayDisplay: Bool = false) -> Bool {
        isBusy || isTimedMultiDayDisplay
    }

    public static func isEventReadOnly(
        lookup: CalendarLookup,
        calendarId: CalendarId?,
        isBusy: Bool
    ) -> Bool {
        if isBusy { return true }
        guard let calendarId else { return false }
        guard let calendar = lookup[calendarId.rawValue] else { return false }
        return !calendar.capabilities.canWrite
    }

    public static func isGridEventInteractionReadOnly(
        lookup: CalendarLookup,
        calendarId: CalendarId?,
        isBusy: Bool,
        isTimedMultiDayDisplay: Bool = false
    ) -> Bool {
        isEventReadOnly(
            lookup: lookup,
            calendarId: calendarId,
            isBusy: isGridEventContentReadOnly(isBusy: isBusy, isTimedMultiDayDisplay: isTimedMultiDayDisplay)
        )
    }

    public static func isGridEventScheduleLocked(
        lookup: CalendarLookup,
        calendarId: CalendarId?,
        isBusy: Bool,
        isProviderManaged: Bool,
        isTimedMultiDayDisplay: Bool = false
    ) -> Bool {
        isGridEventInteractionReadOnly(
            lookup: lookup,
            calendarId: calendarId,
            isBusy: isBusy,
            isTimedMultiDayDisplay: isTimedMultiDayDisplay
        ) || isProviderManaged
    }
}
