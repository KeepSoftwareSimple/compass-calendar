import Foundation

public struct CalendarAccountGroup: Hashable, Sendable {
    public var provider: ProviderEnum
    public var accountEmail: String
    public var connection: UserMetadataConnections?
    public var calendars: [CompassCalendar]

    public var accountKey: String {
        "\(provider.rawValue):\(accountEmail)"
    }

    public var accountLabel: String {
        let product: String = switch provider {
        case .google: "Google"
        case .microsoft: "Microsoft"
        case .apple: "Apple"
        }
        return "\(accountEmail) (\(product))"
    }
}

public enum CalendarAccountGrouping {
    public static func groupCalendarsByAccount(
        calendars: [CompassCalendar],
        connections: [UserMetadataConnections]
    ) -> (groups: [CalendarAccountGroup], ungrouped: [CompassCalendar]) {
        var groups: [CalendarAccountGroup] = []
        var byKey: [String: Int] = [:]
        var ungrouped: [CompassCalendar] = []

        func ensureGroup(
            provider: ProviderEnum,
            accountEmail: String,
            connection: UserMetadataConnections?
        ) -> Int {
            let key = "\(provider.rawValue):\(accountEmail)"
            if let index = byKey[key] { return index }
            let group = CalendarAccountGroup(
                provider: provider,
                accountEmail: accountEmail,
                connection: connection,
                calendars: []
            )
            byKey[key] = groups.count
            groups.append(group)
            return groups.count - 1
        }

        for connection in connections {
            guard let provider = connection.provider,
                  let email = connection.accountEmail, !email.isEmpty
            else { continue }
            _ = ensureGroup(provider: provider, accountEmail: email, connection: connection)
        }

        for calendar in calendars {
            guard let provider = calendarProvider(calendar),
                  let email = calendar.accountEmail, !email.isEmpty
            else {
                ungrouped.append(calendar)
                continue
            }
            let index = ensureGroup(provider: provider, accountEmail: email, connection: nil)
            groups[index].calendars.append(calendar)
        }

        return (groups, ungrouped)
    }

    private static func calendarProvider(_ calendar: CompassCalendar) -> ProviderEnum? {
        guard calendar.provider != "local" else { return nil }
        return ProviderEnum(rawValue: calendar.provider)
    }
}
