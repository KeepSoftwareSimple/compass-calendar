import Foundation

public enum BookingCalendarLogic {
    public static let placeholderCalendarId = "000000000000000000000001"
    public static let availabilityRequiredMessage =
        "Add weekly hours before turning on your meeting page."

    public static func availabilityReadableCalendars(
        _ calendars: [CompassCalendar]
    ) -> [CompassCalendar] {
        calendars.filter { $0.isActive && $0.capabilities.canReadAvailability }
    }

    public static func writableCalendars(
        _ calendars: [CompassCalendar],
        hasConnectedAccount: Bool
    ) -> [CompassCalendar] {
        calendars.filter { calendar in
            guard calendar.isActive, calendar.capabilities.canWrite else { return false }
            if hasConnectedAccount, calendar.provider == "local" { return false }
            return true
        }
    }

    public static func defaultBlockingCalendarIds(
        destinationCalendarId: String,
        calendars: [CompassCalendar]
    ) -> [String] {
        let readable = availabilityReadableCalendars(calendars)
        let destination = calendars.first { $0.id == destinationCalendarId }
        let accountEmail = destination?.accountEmail?.lowercased()
        var ids: [String]
        if let accountEmail {
            ids = readable
                .filter { $0.accountEmail?.lowercased() == accountEmail }
                .map(\.id)
        } else {
            ids = [destinationCalendarId]
        }
        if ids.isEmpty { ids = [destinationCalendarId] }
        if let local = readable.first(where: { $0.provider == "local" }),
           !ids.contains(local.id)
        {
            ids.append(local.id)
        }
        return ids
    }

    public static func isPlaceholderDestination(_ calendarId: String) -> Bool {
        calendarId == placeholderCalendarId
    }

    public static func canEnableBookingPage(
        destinationCalendarId: String,
        writableCalendars: [CompassCalendar]
    ) -> Bool {
        if isPlaceholderDestination(destinationCalendarId) { return false }
        return writableCalendars.contains { $0.id == destinationCalendarId }
    }

    public static func bookingAddressPrefix(publicBookingURL: URL?) -> String {
        let originURL = publicBookingURL ?? AppHostPreference.productionURL
        guard let scheme = originURL.scheme, let host = originURL.host else {
            return "https://www.compasscalendar.com/meet/"
        }
        return "\(scheme)://\(host)/meet/"
    }
}
