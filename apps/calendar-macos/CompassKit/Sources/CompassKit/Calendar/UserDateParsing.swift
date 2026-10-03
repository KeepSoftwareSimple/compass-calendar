import Foundation

/// Parses typed calendar dates. Month-first for `M/D`. English month names only.
/// Mirrors `parseUserDate` in `apps/calendar-web/src/common/utils/datetime/web.date.util.ts`.
public enum UserDateParsing {
    private static let monthNameToIndex: [String: Int] = [
        "january": 1, "jan": 1,
        "february": 2, "feb": 2,
        "march": 3, "mar": 3,
        "april": 4, "apr": 4,
        "may": 5,
        "june": 6, "jun": 6,
        "july": 7, "jul": 7,
        "august": 8, "aug": 8,
        "september": 9, "sept": 9, "sep": 9,
        "october": 10, "oct": 10,
        "november": 11, "nov": 11,
        "december": 12, "dec": 12,
    ]

    private static let monthNamePattern: String = {
        monthNameToIndex.keys.sorted { $0.count > $1.count }.joined(separator: "|")
    }()

    public static func parseUserDate(_ text: String, now: Date) -> Date? {
        let normalized = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: ".", with: "")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        guard !normalized.isEmpty else { return nil }

        if let match = firstMatch(normalized, pattern: #"^(\d{4})-(\d{1,2})-(\d{1,2})$"#) {
            return calendarDate(
                year: Int(match[1])!,
                month: Int(match[2])!,
                day: Int(match[3])!)
        }

        if let match = firstMatch(normalized, pattern: #"^(\d{1,2})/(\d{1,2})(?:/(\d{2}|\d{4}))?$"#) {
            let month = Int(match[1])!
            let day = Int(match[2])!
            if match.indices.contains(3), let yearToken = match[3] {
                return calendarDate(
                    year: expandTwoDigitYear(Int(yearToken)!),
                    month: month,
                    day: day)
            }
            return dateWithInferredYear(month: month, day: day, now: now)
        }

        let monthFirst = "^(\(monthNamePattern))(?:\\s+|\\s*,\\s*)(\\d{1,2})(?:(?:\\s+|\\s*,\\s*)(\\d{4}))?$"
        if let match = firstMatch(normalized, pattern: monthFirst) {
            guard let month = monthNameToIndex[match[1]] else { return nil }
            let day = Int(match[2])!
            if match.indices.contains(3), let yearToken = match[3] {
                return calendarDate(year: Int(yearToken)!, month: month, day: day)
            }
            return dateWithInferredYear(month: month, day: day, now: now)
        }

        let dayFirst = "^(\\d{1,2})(?:\\s+|\\s*,\\s*)(\(monthNamePattern))(?:(?:\\s+|\\s*,\\s*)(\\d{4}))?$"
        if let match = firstMatch(normalized, pattern: dayFirst) {
            let day = Int(match[1])!
            guard let month = monthNameToIndex[match[2]] else { return nil }
            if match.indices.contains(3), let yearToken = match[3] {
                return calendarDate(year: Int(yearToken)!, month: month, day: day)
            }
            return dateWithInferredYear(month: month, day: day, now: now)
        }

        return nil
    }

    public static func goToDatePaletteLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = EffectiveTimeZone.calendar
        formatter.timeZone = EffectiveTimeZone.timeZone
        formatter.dateFormat = "EEE, MMM d, yyyy"
        return "Go to \(formatter.string(from: date))"
    }

    public static func goToDateAnnouncement(_ date: Date, view: GoToDateViewKind) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = EffectiveTimeZone.calendar
        formatter.timeZone = EffectiveTimeZone.timeZone
        switch view {
        case .day:
            formatter.dateFormat = "EEEE, MMMM d, yyyy"
            return "Showing \(formatter.string(from: date))"
        case .week, .life:
            formatter.dateFormat = "EEEE, MMMM d, yyyy"
            return "Showing week of \(formatter.string(from: date))"
        }
    }

    public enum GoToDateViewKind: Sendable {
        case day
        case week
        case life
    }

    private static func firstMatch(_ text: String, pattern: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return nil
        }
        let range = NSRange(text.startIndex ..< text.endIndex, in: text)
        guard let result = regex.firstMatch(in: text, options: [], range: range) else { return nil }
        var groups: [String] = []
        for index in 1 ..< result.numberOfRanges {
            let groupRange = result.range(at: index)
            guard groupRange.location != NSNotFound, let swiftRange = Range(groupRange, in: text) else {
                groups.append("")
                continue
            }
            groups.append(String(text[swiftRange]))
        }
        return groups
    }

    private static func expandTwoDigitYear(_ year: Int) -> Int {
        year >= 100 ? year : 2000 + year
    }

    private static func calendarDate(year: Int, month: Int, day: Int) -> Date? {
        guard (1000 ... 9999).contains(year),
              (1 ... 12).contains(month),
              (1 ... 31).contains(day)
        else { return nil }

        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 0
        components.minute = 0
        components.second = 0
        guard let date = EffectiveTimeZone.calendar.date(from: components) else { return nil }
        let resolved = EffectiveTimeZone.calendar.dateComponents([.year, .month, .day], from: date)
        guard resolved.year == year, resolved.month == month, resolved.day == day else { return nil }
        return date
    }

    private static func dateWithInferredYear(month: Int, day: Int, now: Date) -> Date? {
        let calendar = EffectiveTimeZone.calendar
        let nowYear = calendar.component(.year, from: now)
        guard let thisYear = calendarDate(year: nowYear, month: month, day: day) else { return nil }
        let cutoff = calendar.date(byAdding: .month, value: -6, to: calendar.startOfDay(for: now))!
        if thisYear < cutoff {
            return calendarDate(year: nowYear + 1, month: month, day: day)
        }
        return thisYear
    }
}
