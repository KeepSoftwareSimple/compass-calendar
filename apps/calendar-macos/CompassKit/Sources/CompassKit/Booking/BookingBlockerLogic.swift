import Foundation

public enum BookingBlockerAction: String, Sendable {
    case reconnect
    case connect
    case info
}

public struct BookingBlocker: Hashable, Sendable {
    public var action: BookingBlockerAction
    public var message: String

    public init(action: BookingBlockerAction, message: String) {
        self.action = action
        self.message = message
    }
}

public enum BookingBookabilityCopy {
    public static let notBookablePrefix = "Guests can't book right now"
    public static let billingStatus =
        "A paid subscription is required to make changes"
    public static let importingStatus =
        "Your calendar is still importing. Guests can book once it finishes."
    public static let delayedStatus =
        "Your calendar sync is delayed. Compass is retrying."
    public static let connectToResume =
        "Connect a calendar to turn your page back on."
    public static let blockingCalendarFallback = "A blocking calendar"
    public static let destinationCalendarFallback = "The destination calendar"

    public static func line(_ copy: String) -> String {
        "\(notBookablePrefix): \(copy)"
    }
}

public enum BookingBlockerLogic {
    public static func selectBookingBlocker(
        connections: [UserMetadataConnections],
        calendars: [CompassCalendar],
        hasHealthyConnection: Bool,
        status: BookingPageStatusResponse?
    ) -> BookingBlocker? {
        if !hasHealthyConnection {
            let reconnecting = BookingConnectionHealth.reconnectRequiredConnections(connections)
            if let first = reconnecting.first {
                return BookingBlocker(
                    action: .reconnect,
                    message: BookingBookabilityCopy.line(reconnectMessage(for: first))
                )
            }
            if BookingConnectionHealth.isImporting(connections: connections) {
                return BookingBlocker(
                    action: .info,
                    message: BookingBookabilityCopy.line(BookingBookabilityCopy.importingStatus)
                )
            }
            return BookingBlocker(
                action: .connect,
                message: BookingBookabilityCopy.line(BookingBookabilityCopy.connectToResume)
            )
        }

        guard let status, !status.bookable else { return nil }
        guard let reason = topReason(status.reasons) else {
            return BookingBlocker(action: .info, message: "\(BookingBookabilityCopy.notBookablePrefix).")
        }
        return reasonBlocker(reason, calendars: calendars, connections: connections)
    }

    private static func topReason(
        _ reasons: [BookingPageStatusResponseReasons]
    ) -> BookingPageStatusResponseReasons? {
        reasons.min { reasonRank($0) < reasonRank($1) }
    }

    private static func reasonRank(_ reason: BookingPageStatusResponseReasons) -> Int {
        switch reason.kind {
        case .connection:
            if let state = reason.connectionState,
               state == .actionRequired || state == .disconnected
            {
                return 0
            }
            return 3
        case .billing:
            return 1
        case .calendar:
            return reason.reason == "stale" ? 4 : 2
        }
    }

    private static func reasonBlocker(
        _ reason: BookingPageStatusResponseReasons,
        calendars: [CompassCalendar],
        connections: [UserMetadataConnections]
    ) -> BookingBlocker {
        switch reason.kind {
        case .billing:
            return BookingBlocker(
                action: .info,
                message: BookingBookabilityCopy.line(BookingBookabilityCopy.billingStatus)
            )
        case .calendar:
            let name = bookingCalendarName(calendars, calendarId: reason.calendarId?.rawValue)
            return BookingBlocker(
                action: .info,
                message: BookingBookabilityCopy.line(
                    calendarUnbookableCopy(name: name, reason: reason.reason)
                )
            )
        case .connection:
            if let state = reason.connectionState,
               state == .actionRequired || state == .disconnected
            {
                let target = BookingConnectionHealth.reconnectRequiredConnections(connections).first
                return BookingBlocker(
                    action: .reconnect,
                    message: BookingBookabilityCopy.line(reconnectMessage(for: target))
                )
            }
            if let state = reason.connectionState {
                if state == .importing || state == .connecting {
                    return BookingBlocker(
                        action: .info,
                        message: BookingBookabilityCopy.line(BookingBookabilityCopy.importingStatus)
                    )
                }
                if state == .delayed || state == .catchingUp {
                    return BookingBlocker(
                        action: .info,
                        message: BookingBookabilityCopy.line(BookingBookabilityCopy.delayedStatus)
                    )
                }
            }
            return BookingBlocker(
                action: .info,
                message: "\(BookingBookabilityCopy.notBookablePrefix)."
            )
        }
    }

    private static func bookingCalendarName(
        _ calendars: [CompassCalendar],
        calendarId: String?
    ) -> String {
        guard let calendarId,
              let name = calendars.first(where: { $0.id == calendarId })?.name
        else { return BookingBookabilityCopy.blockingCalendarFallback }
        return name
    }

    private static func calendarUnbookableCopy(name: String, reason: String) -> String {
        if reason == "notImported" {
            return "\(name) is no longer synced. Remove it from Blocking calendars or reconnect the account."
        }
        if reason == "notWritable" {
            let label = name == BookingBookabilityCopy.blockingCalendarFallback
                ? BookingBookabilityCopy.destinationCalendarFallback
                : name
            return "\(label) can't accept new events. Choose a writable destination or reconnect the account."
        }
        return "\(name) hasn't synced recently. Guests can book once it catches up."
    }

    private static func reconnectMessage(for connection: UserMetadataConnections?) -> String {
        guard let connection, let provider = connection.provider else {
            return "Reconnect your calendar account to resume booking."
        }
        switch provider {
        case .google:
            return "Reconnect Google to resume booking."
        case .microsoft:
            return "Reconnect Microsoft to resume booking."
        case .apple:
            return "Reconnect iCloud to resume booking."
        }
    }
}
