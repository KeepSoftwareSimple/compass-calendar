import Foundation

public enum CalendarCapabilities {
    public static func canInvite(on calendar: CompassCalendar?) -> Bool {
        guard let calendar else { return false }
        return calendar.capabilities.canInviteAttendees && calendar.capabilities.canWrite
    }

    public static func creatableConferenceKind(on calendar: CompassCalendar?) -> ConferenceKindsEnum? {
        guard calendar?.capabilities.canWrite == true else { return nil }
        return calendar?.capabilities.conferenceKinds.first
    }

    public static func conferenceKindLabel(_ kind: ConferenceKindsEnum) -> String {
        switch kind {
        case .meet: return "Google Meet"
        case .teams: return "Microsoft Teams"
        }
    }

    public static func invitationHostLabel(for calendar: CompassCalendar?) -> String {
        guard let calendar else { return "Your calendar" }
        if calendar.provider == "local" { return "Your calendar" }
        switch calendar.provider {
        case "google": return "Google Calendar"
        case "microsoft": return "Microsoft Outlook"
        case "apple": return "Apple Calendar"
        default: return calendar.name
        }
    }
}
