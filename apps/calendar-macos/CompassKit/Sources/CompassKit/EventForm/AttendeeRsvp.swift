import Foundation

public enum AttendeeRsvp {
    public static func statusByEmail(
        _ attendees: [EventContentDetailsAttendees]?
    ) -> [String: ResponseStatusEnum] {
        var map: [String: ResponseStatusEnum] = [:]
        for attendee in attendees ?? [] {
            map[attendee.email.lowercased()] = attendee.responseStatus
        }
        return map
    }

    public static func formatTally(statuses: [ResponseStatusEnum]) -> String? {
        guard !statuses.isEmpty else { return nil }
        var counts: [ResponseStatusEnum: Int] = [:]
        for status in statuses {
            counts[status, default: 0] += 1
        }
        let guestWord = statuses.count == 1 ? "guest" : "guests"
        var parts = ["\(counts[.accepted, default: 0]) yes", "\(counts[.needsAction, default: 0]) awaiting"]
        if counts[.declined, default: 0] > 0 {
            parts.append("\(counts[.declined, default: 0]) no")
        }
        if counts[.tentative, default: 0] > 0 {
            parts.append("\(counts[.tentative, default: 0]) maybe")
        }
        return "\(statuses.count) \(guestWord) (\(parts.joined(separator: ", ")))"
    }

    public static func organizesEvent(
        organizerEmail: String?,
        calendarAccountEmail: String?
    ) -> Bool {
        guard let organizerEmail, let calendarAccountEmail else {
            return organizerEmail == nil
        }
        return organizerEmail.lowercased() == calendarAccountEmail.lowercased()
    }
}
