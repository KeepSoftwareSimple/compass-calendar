import CompassKit
import Foundation

enum GridEventDraftGuests {
    static func sourceAttendees(from event: Event?) -> [EventContentDetailsAttendees] {
        guard let event, case .details(let payload) = event.content else { return [] }
        return payload.attendees ?? []
    }

    static func guestsChanged(draft: GridEventDraft, baseline: Event?) -> Bool {
        guard let edited = draft.attendees else { return false }
        if draft.kind == .create { return !edited.isEmpty }
        let source = sourceAttendees(from: baseline)
        let editedSet = Set(edited.map { $0.email.lowercased() })
        let sourceSet = Set(source.map { $0.email.lowercased() })
        return editedSet != sourceSet
    }

    static func withoutGuestEdit(_ draft: GridEventDraft) -> GridEventDraft {
        guard draft.attendees != nil else { return draft }
        var next = draft
        next.attendees = nil
        return next
    }

    static func displayAttendees(draft: GridEventDraft, baseline: Event?) -> [DraftAttendeeInput] {
        if let attendees = draft.attendees { return attendees }
        return sourceAttendees(from: baseline).map {
            DraftAttendeeInput(email: $0.email, displayName: $0.displayName)
        }
    }
}
