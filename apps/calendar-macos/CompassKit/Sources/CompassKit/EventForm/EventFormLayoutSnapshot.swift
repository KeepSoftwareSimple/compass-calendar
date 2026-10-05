import Foundation

/// Stable field order and accessibility ids for parity tests (WP-18 form layout snapshot).
public struct EventFormLayoutSnapshot: Codable, Hashable, Sendable {
    public struct FieldRow: Codable, Hashable, Sendable {
        public let field: String
        public let digit: String
        public let accessibilityId: String
        public let visible: Bool

        public init(field: String, digit: String, accessibilityId: String, visible: Bool) {
            self.field = field
            self.digit = digit
            self.accessibilityId = accessibilityId
            self.visible = visible
        }
    }

    public let mode: String
    public let fields: [FieldRow]

    public init(mode: String, fields: [FieldRow]) {
        self.mode = mode
        self.fields = fields
    }
}

public enum EventFormLayoutSnapshotBuilder {
    private static let wp18VisibleFields: Set<EventFormField> = [
        .actions, .title, .description, .start, .end, .calendar, .color,
    ]

    private static func accessibilityId(for field: EventFormField) -> String {
        switch field {
        case .actions: return "compass-event-form-actions"
        case .title: return "compass-event-form-title"
        case .start: return "compass-event-form-start"
        case .end: return "compass-event-form-end"
        case .calendar: return "compass-event-form-calendar"
        case .color: return "compass-event-form-color"
        case .recurrence: return "compass-event-form-recurrence"
        case .location: return "compass-event-form-location"
        case .attendees: return "compass-event-form-attendees"
        case .description: return "compass-event-form-description"
        case .rsvp: return "compass-event-form-rsvp"
        case .conference: return "compass-event-form-conference"
        }
    }

    public static func build(
        mode: String,
        registryRows: [ShortcutRegistry.EditSequenceFieldRow]
    ) -> EventFormLayoutSnapshot {
        let sorted = FormFieldDigitMapping.sortedRows(registryRows)
        let rows = sorted.compactMap { row -> EventFormLayoutSnapshot.FieldRow? in
            guard let field = EventFormField(rawValue: row.field) else { return nil }
            let visible = wp18VisibleFields.contains(field)
            return EventFormLayoutSnapshot.FieldRow(
                field: row.field,
                digit: row.digit,
                accessibilityId: accessibilityId(for: field),
                visible: visible
            )
        }
        return EventFormLayoutSnapshot(mode: mode, fields: rows)
    }
}
