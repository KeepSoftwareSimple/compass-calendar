import Foundation

/// Best IANA zone from connected calendars (web `pickCalendarTimeZoneHint`).
public enum CalendarTimeZoneHint {
    /// Web tests `calendar.timeZone` for truthiness, so a calendar carrying no
    /// zone (or an empty one) is not a candidate at all. Keeping that in one
    /// place is what stops the primary preference below from being consumed by
    /// a zone-less primary.
    private static func usableZone(of calendar: CompassCalendar) -> String? {
        guard let zone = calendar.timeZone?.rawValue, !zone.isEmpty else {
            return nil
        }
        return zone
    }

    public static func pick(from calendars: [CompassCalendar]) -> String? {
        if let primary = calendars.first(where: { $0.isPrimary && usableZone(of: $0) != nil }),
           let zone = usableZone(of: primary),
           TimeZoneFormatting.isValidTimeZone(zone)
        {
            return zone
        }

        for calendar in calendars {
            guard let zone = usableZone(of: calendar),
                  TimeZoneFormatting.isValidTimeZone(zone),
                  !TimeZoneFormatting.isUtcLikeTimeZone(zone)
            else { continue }
            return zone
        }

        for calendar in calendars {
            guard let zone = usableZone(of: calendar),
                  TimeZoneFormatting.isValidTimeZone(zone)
            else { continue }
            return zone
        }

        return nil
    }
}
