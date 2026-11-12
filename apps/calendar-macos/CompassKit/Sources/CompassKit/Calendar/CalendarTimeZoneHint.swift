import Foundation

/// Best IANA zone from connected calendars (web `pickCalendarTimeZoneHint`).
public enum CalendarTimeZoneHint {
    public static func pick(from calendars: [CompassCalendar]) -> String? {
        if let primary = calendars.first(where: { $0.isPrimary }),
           let zone = primary.timeZone,
           TimeZoneFormatting.isValidTimeZone(zone)
        {
            return zone
        }

        for calendar in calendars {
            guard let zone = calendar.timeZone,
                  TimeZoneFormatting.isValidTimeZone(zone),
                  !TimeZoneFormatting.isUtcLikeTimeZone(zone)
            else { continue }
            return zone
        }

        for calendar in calendars {
            guard let zone = calendar.timeZone,
                  TimeZoneFormatting.isValidTimeZone(zone)
            else { continue }
            return zone
        }

        return nil
    }
}
