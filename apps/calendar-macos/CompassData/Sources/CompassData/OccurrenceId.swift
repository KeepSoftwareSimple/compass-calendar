import Foundation

/// Subset of `@core/util/occurrence-id` used when promoting local events.
enum OccurrenceId {
    private static let separator = "::"

    static func looksLikeOccurrenceId(_ id: String) -> Bool {
        id.contains(separator)
    }
}
