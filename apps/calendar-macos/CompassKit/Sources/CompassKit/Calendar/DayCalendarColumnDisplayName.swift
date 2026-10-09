import Foundation

/// Parity with `dayCalendarColumnDisplayName.util.ts`.
public enum DayCalendarColumnDisplayName {
    public static func format(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let at = trimmed.lastIndex(of: "@"), at > trimmed.startIndex else {
            return trimmed
        }
        let domainStart = trimmed.index(after: at)
        guard domainStart < trimmed.endIndex, !trimmed.contains(" ") else {
            return trimmed
        }
        return String(trimmed[..<at])
    }
}
