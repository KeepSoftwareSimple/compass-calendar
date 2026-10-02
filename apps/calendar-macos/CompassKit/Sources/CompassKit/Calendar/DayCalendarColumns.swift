import Foundation

/// Day view column selection parity with `dayCalendarColumns.util.ts`.
public enum DayCalendarColumns {
    public static func dayViewCalendars(_ calendars: [CompassCalendar]) -> [CompassCalendar] {
        let eligible = calendars.filter { $0.isActive && $0.isVisible }
        if !eligible.isEmpty {
            return eligible
        }
        if let primary = calendars.first(where: { $0.isPrimary }) {
            return [primary]
        }
        if let first = calendars.first {
            return [first]
        }
        return []
    }
}
