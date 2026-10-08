import Foundation

public enum DefaultCalendarResolver {
    public static func writableCalendars(
        _ calendars: [CompassCalendar],
        hasConnectedAccount: Bool
    ) -> [CompassCalendar] {
        calendars.filter { calendar in
            guard calendar.isActive, calendar.isVisible else { return false }
            if calendar.access == .freeBusyReader || calendar.access == .reader {
                return false
            }
            if hasConnectedAccount, calendar.provider == "local" {
                return false
            }
            return calendar.capabilities.canManage
        }
    }

    public static func resolvedDefault(
        calendars: [CompassCalendar],
        storedId: String?,
        hasConnectedAccount: Bool
    ) -> CompassCalendar? {
        let writable = writableCalendars(calendars, hasConnectedAccount: hasConnectedAccount)
        if let storedId,
           let match = writable.first(where: { $0.id == storedId })
        {
            return match
        }
        if let primary = writable.first(where: { $0.isPrimary }) {
            return primary
        }
        return writable.first
    }
}
