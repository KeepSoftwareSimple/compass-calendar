import Foundation

/// Physical top-row key labels in left-to-right order (matches web `PICK_KEY_LABELS`).
public enum FormFieldDigitMapping {
    public static let pickKeyLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="]

    /// Maps a Mod+digit chord character to a form field using registry edit-sequence rows.
    public static func field(
        forDigitCharacter digit: Character,
        rows: [ShortcutRegistry.EditSequenceFieldRow]
    ) -> EventFormField? {
        let label = String(digit)
        guard let row = rows.first(where: { $0.digit == label }) else { return nil }
        return EventFormField(rawValue: row.field)
    }

    /// Rows sorted in physical top-row order for layout snapshots and hint chips.
    public static func sortedRows(
        _ rows: [ShortcutRegistry.EditSequenceFieldRow]
    ) -> [ShortcutRegistry.EditSequenceFieldRow] {
        rows.sorted { lhs, rhs in
            pickKeyLabels.firstIndex(of: lhs.digit) ?? 999
                < pickKeyLabels.firstIndex(of: rhs.digit) ?? 999
        }
    }

    public static func digitLabel(for field: EventFormField, rows: [ShortcutRegistry.EditSequenceFieldRow]) -> String? {
        rows.first(where: { $0.field == field.rawValue })?.digit
    }
}
