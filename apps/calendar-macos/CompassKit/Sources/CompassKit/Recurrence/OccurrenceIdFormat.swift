import Foundation

/// Mirrors `packages/core/src/util/occurrence-id.ts`.
///
/// The app-facing id of a projected series occurrence is
/// `${eventId}::${recurrenceId}`. The backend mints it in
/// `event-list.translation.ts` and reverses it in `event-command.translation.ts`,
/// so every client that composes or decodes one has to use this exact format or
/// a write addressed at a single occurrence stops resolving server-side.
///
/// The eventId is a 24-char ObjectId hex (no colons) and the recurrenceId is an
/// ISO datetime (single colons only, never `::`), so the FIRST `::` is an
/// unambiguous separator. Ids that do not match that shape (a plain event id, a
/// demo-seeded id, or a local split-series id that nests another segment)
/// decode to nil, and the caller falls back to the event's own schedule rather
/// than guessing, exactly as `recurrenceIdForOccurrence` does on the web.
public enum OccurrenceIdFormat {
    public static let separator = "::"

    private static let objectIdPattern = "^[0-9a-f]{24}$"
    private static let isoDateTimePattern =
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$"

    /// Compose the app-facing id for one projected occurrence.
    public static func compose(eventId: String, recurrenceId: String) -> String {
        "\(eventId)\(separator)\(recurrenceId)"
    }

    /// The recurrenceId carried by a composite occurrence id, or nil when the id
    /// is not one.
    public static func recurrenceId(of id: String) -> String? {
        guard let range = id.range(of: separator) else { return nil }
        let eventId = String(id[id.startIndex..<range.lowerBound])
        let recurrenceId = String(id[range.upperBound...])
        guard matches(eventId, objectIdPattern), matches(recurrenceId, isoDateTimePattern) else {
            return nil
        }
        return recurrenceId
    }

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
}
