import Foundation

/// Parse and build RRULE lines for native recurrence editing (web RecurrenceSection parity).
public enum RecurrenceRuleLine {
    public enum Frequency: String, Sendable, CaseIterable {
        case daily = "DAILY"
        case weekly = "WEEKLY"
        case monthly = "MONTHLY"
    }

    public struct Pattern: Sendable, Equatable {
        public var frequency: Frequency
        public var interval: Int
        public var byWeekday: [Int]
        public var until: Date?

        public init(
            frequency: Frequency = .weekly,
            interval: Int = 1,
            byWeekday: [Int] = [],
            until: Date? = nil
        ) {
            self.frequency = frequency
            self.interval = max(1, interval)
            self.byWeekday = byWeekday
            self.until = until
        }
    }

    public static func firstRule(from rules: [String]) -> String? {
        rules.first { $0.uppercased().hasPrefix("RRULE:") }
    }

    public static func parsePattern(from rules: [String]) -> Pattern? {
        guard let line = firstRule(from: rules) else { return nil }
        return parsePattern(fromLine: line)
    }

    public static func parsePattern(fromLine line: String) -> Pattern? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.uppercased().hasPrefix("RRULE:") else { return nil }
        let body = String(trimmed.dropFirst("RRULE:".count))
        var frequency: Frequency?
        var interval = 1
        var until: Date?
        var byWeekday: [Int] = []

        for token in body.split(separator: ";") {
            let parts = token.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { continue }
            let key = parts[0].uppercased()
            let value = parts[1]
            switch key {
            case "FREQ":
                frequency = Frequency(rawValue: value.uppercased())
            case "INTERVAL":
                interval = max(1, Int(value) ?? 1)
            case "UNTIL":
                until = parseUntil(value)
            case "BYDAY":
                byWeekday = value.split(separator: ",").compactMap { parseWeekday(String($0)) }
            default:
                break
            }
        }
        guard let frequency else { return nil }
        return Pattern(frequency: frequency, interval: interval, byWeekday: byWeekday, until: until)
    }

    public static func buildLine(
        pattern: Pattern,
        scheduleStart: Date,
        scheduleEnd: Date,
        timeZoneIdentifier: String,
        isAllDay: Bool
    ) -> String? {
        var tokens: [String] = ["FREQ=\(pattern.frequency.rawValue)"]
        if pattern.interval > 1 {
            tokens.append("INTERVAL=\(pattern.interval)")
        }
        if !pattern.byWeekday.isEmpty {
            tokens.append("BYDAY=\(pattern.byWeekday.map(weekdayToken).joined(separator: ","))")
        }
        if let until = pattern.until {
            tokens.append("UNTIL=\(formatUntil(until, isAllDay: isAllDay, timeZoneIdentifier: timeZoneIdentifier))")
        }
        return "RRULE:" + tokens.joined(separator: ";")
    }

    public static func summary(
        rules: [String],
        scheduleStartISO: String,
        scheduleEndISO: String,
        timeZoneIdentifier: String
    ) -> String {
        guard let line = firstRule(from: rules),
              let rule = RecurrenceRule(
                  startDateISO: scheduleStartISO,
                  endDateISO: scheduleEndISO,
                  recurrenceRule: line,
                  timeZoneIdentifier: timeZoneIdentifier
              )
        else {
            return ""
        }
        return rule.summary()
    }

    private static func parseUntil(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        if value.hasSuffix("Z") {
            formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
            return formatter.date(from: value)
        }
        if value.contains("T") {
            formatter.dateFormat = "yyyyMMdd'T'HHmmss"
            return formatter.date(from: value)
        }
        formatter.dateFormat = "yyyyMMdd"
        return formatter.date(from: value)
    }

    private static func parseWeekday(_ token: String) -> Int? {
        let map: [String: Int] = [
            "MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6,
        ]
        let upper = token.uppercased()
        if let direct = map[upper] { return direct }
        if upper.count >= 2 {
            return map[String(upper.suffix(2))]
        }
        return nil
    }

    private static func weekdayToken(_ index: Int) -> String {
        switch index {
        case 0: "MO"
        case 1: "TU"
        case 2: "WE"
        case 3: "TH"
        case 4: "FR"
        case 5: "SA"
        default: "SU"
        }
    }

    private static func formatUntil(_ until: Date, isAllDay: Bool, timeZoneIdentifier: String) -> String {
        if isAllDay {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyyMMdd"
            return formatter.string(from: until) + "Z"
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(identifier: timeZoneIdentifier) ?? .gmt
        let formatted = formatter.string(from: until)
        return formatted
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: ":", with: "")
            .replacingOccurrences(of: ".000", with: "")
            .appending("Z")
    }
}
