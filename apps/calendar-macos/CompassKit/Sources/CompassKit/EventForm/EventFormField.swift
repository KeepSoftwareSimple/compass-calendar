/// Mirrors `@core/shortcuts/event-form-focus-field`.
public enum EventFormField: String, Sendable, Hashable, CaseIterable {
    case actions
    case title
    case location
    case description
    case start
    case end
    case recurrence
    case calendar
    case color
    case attendees
    case rsvp
    case conference
}
