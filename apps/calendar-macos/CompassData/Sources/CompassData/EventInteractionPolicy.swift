import CompassKit
import Foundation

public enum EventInteractionPolicy {
    public static func isReadOnly(event: Event, calendars: [CompassCalendar]) -> Bool {
        if case .busy = event.content { return true }
        guard let calendar = calendars.first(where: { $0.id == event.calendarId.rawValue }) else {
            return true
        }
        return !calendar.capabilities.canWrite
    }

    public static func isOccurrenceThisScopeAsk(event: Event, scope: EventDeleteScope) -> Bool {
        event.recurrence.kind == .occurrence && scope == .this
    }
}
