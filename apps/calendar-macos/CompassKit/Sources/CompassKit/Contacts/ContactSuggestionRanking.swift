import Foundation

public enum ContactSuggestionConstants {
    public static let debounceMilliseconds = 250
    public static let minQueryLength = 2
    public static let staleTimeMilliseconds = 30_000
}

public enum ContactSuggestionRanking {
    public static func rank(
        _ suggestions: [ContactSuggestion],
        query: String
    ) -> [ContactSuggestion] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return suggestions }
        return suggestions
            .enumerated()
            .map { index, suggestion in
                let label = (suggestion.displayName ?? suggestion.email).lowercased()
                let email = suggestion.email.lowercased()
                let score = fuzzyScore(label: label, email: email, query: needle)
                return (index, suggestion, score)
            }
            .sorted { lhs, rhs in
                if lhs.2 != rhs.2 { return lhs.2 > rhs.2 }
                return lhs.0 < rhs.0
            }
            .map(\.1)
    }

    private static func fuzzyScore(label: String, email: String, query: String) -> Int {
        if label.hasPrefix(query) || email.hasPrefix(query) { return 100 }
        if label.contains(query) || email.contains(query) { return 50 }
        return 0
    }
}
