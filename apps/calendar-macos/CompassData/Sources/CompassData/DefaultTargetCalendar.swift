import CompassKit
import Foundation

/// Port of `getDefaultTargetCalendar` for local-event promotion.
public enum DefaultTargetCalendar {
    public static func resolve(
        calendars: [CompassCalendar],
        accountEmailOrder: [String] = []
    ) -> CompassCalendar? {
        let hasConnectedAccount = !accountEmailOrder.isEmpty
        let primaries = calendars.filter { calendar in
            calendar.isPrimary && isWritableProviderCalendar(calendar)
        }
        let byConnectionOrder = accountEmailOrder.compactMap { email in
            primaries.first { $0.accountEmail == email }
        }.first

        if let match = byConnectionOrder ?? primaries.first {
            return match
        }
        if hasConnectedAccount {
            return nil
        }
        return calendars.first { $0.provider == "local" }
    }

    private static func isWritableProviderCalendar(_ calendar: CompassCalendar) -> Bool {
        calendar.capabilities.canWrite && calendar.provider != "local"
    }
}
