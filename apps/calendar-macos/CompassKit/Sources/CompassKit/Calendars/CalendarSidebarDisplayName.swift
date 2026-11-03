import Foundation

/// Web `calendarRowDisplayName`: under an account heading, repeat the account
/// email as "primary" but keep provider titles such as Microsoft's "Calendar".
public enum CalendarSidebarDisplayName {
    public static func rowTitle(
        for calendar: CompassCalendar,
        underAccountHeading: Bool,
    ) -> String {
        guard underAccountHeading else { return calendar.name }
        guard calendar.isPrimary else { return calendar.name }
        let normalizedName = calendar.name
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let normalizedEmail = calendar.accountEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if let normalizedEmail, !normalizedEmail.isEmpty, normalizedName == normalizedEmail {
            return "primary"
        }
        return calendar.name
    }
}
