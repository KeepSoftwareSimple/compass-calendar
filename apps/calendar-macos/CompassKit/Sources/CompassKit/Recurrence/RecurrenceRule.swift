import Foundation

/// Native recurrence expansion aligned with `CompassEventRRule` / `projectRecurringEdit`.
public struct RecurrenceRule: Sendable, Equatable {
    public let startDate: Date
    public let endDate: Date
    public let timeZone: TimeZone
    public let isAllDay: Bool
    private let parts: ParsedRecurrenceRule
    private let dtstartFloating: Date
    private let untilFloating: Date?

    public init?(
        startDateISO: String,
        endDateISO: String,
        recurrenceRule: String,
        timeZoneIdentifier: String
    ) {
        guard let timeZone = TimeZone(identifier: timeZoneIdentifier) else {
            return nil
        }
        guard let parsedParts = ParsedRecurrenceRule.parse(recurrenceRule) else {
            return nil
        }
        let isAllDay = startDateISO.count == 10 && endDateISO.count == 10
        guard
            let start = RecurrenceRule.parseScheduleInstant(
                startDateISO,
                timeZone: timeZone,
                isAllDay: isAllDay
            ),
            let end = RecurrenceRule.parseScheduleInstant(
                endDateISO,
                timeZone: timeZone,
                isAllDay: isAllDay
            )
        else {
            return nil
        }

        self.startDate = start
        self.endDate = end
        self.timeZone = timeZone
        self.isAllDay = isAllDay
        self.parts = parsedParts
        self.dtstartFloating = isAllDay
            ? start
            : RecurrenceFloatingTime.toFloating(wall: start, timeZone: timeZone)
        if let untilReal = parsedParts.untilReal {
            self.untilFloating = isAllDay
                ? untilReal
                : RecurrenceFloatingTime.toFloating(wall: untilReal, timeZone: timeZone)
        } else {
            self.untilFloating = nil
        }
    }

    /// RRULE summary text matching the web `CompassEventRRule.toString()` output.
    public func summary() -> String {
        RecurrenceRuleSerializer.summary(
            parts: parts,
            isTimed: !isAllDay,
            timeZone: timeZone,
            untilFloating: untilFloating
        )
    }

    /// Serialized RRULE line(s) without DTSTART/DTEND.
    public func serialize() -> String {
        summary()
    }

    /// Expand occurrences for optimistic series projection (server still expands reads).
    public func occurrences(from: Date, limit: Int) -> [Date] {
        let capped = min(max(limit, 0), RecurrenceConstants.maxRecurrences)
        let all = expandAll(limit: capped)
        return all.filter { $0 >= from }
    }

    /// Expansion matching `CompassEventRRule.all` with an index cap.
    public func all(limit: Int) -> [Date] {
        expandAll(limit: max(limit, 0))
    }

    private func expandAll(limit: Int) -> [Date] {
        if parts.interval == 0 {
            return []
        }
        if parts.count == 0 {
            return includesDtStartOnly()
        }

        var hits: [Date] = []
        var dayOffset = 0
        let maxScan = 6_000
        let countCap = parts.count

        while dayOffset < maxScan {
            if let countCap, hits.count >= countCap {
                break
            }
            if hits.count >= limit {
                break
            }
            let candidateFloating = RecurrenceFloatingTime.addDays(
                to: dtstartFloating,
                days: dayOffset
            )
            if let untilFloating, candidateFloating > untilFloating {
                break
            }
            if candidateFloating >= dtstartFloating,
               matches(floating: candidateFloating)
            {
                let localized = isAllDay
                    ? candidateFloating
                    : RecurrenceFloatingTime.localize(
                        floating: candidateFloating,
                        timeZone: timeZone
                    )
                hits.append(localized)
            }
            dayOffset += 1
        }

        if hits.isEmpty {
            return includesDtStartOnly()
        }

        let first = hits[0]
        if wallTimesEqual(first, startDate) {
            return hits
        }
        return [startDate] + hits
    }

    private func includesDtStartOnly() -> [Date] {
        [startDate]
    }

    private func wallTimesEqual(_ lhs: Date, _ rhs: Date) -> Bool {
        if isAllDay {
            return RecurrenceFloatingTime.daysBetween(start: lhs, end: rhs) == 0
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let left = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: lhs
        )
        let right = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: rhs
        )
        return left == right
    }

    private func matches(floating candidate: Date) -> Bool {
        switch parts.frequency {
        case .daily:
            let days = RecurrenceFloatingTime.daysBetween(start: dtstartFloating, end: candidate)
            guard days >= 0, days % parts.interval == 0 else { return false }
            return true
        case .weekly:
            let weekIndex = weekIndexSinceStart(for: candidate)
            guard weekIndex >= 0, weekIndex % parts.interval == 0 else { return false }
            let weekday = RecurrenceFloatingTime.rruleWeekdayIndex(fromFloating: candidate)
            if parts.byWeekday.isEmpty {
                let startWeekday = RecurrenceFloatingTime.rruleWeekdayIndex(fromFloating: dtstartFloating)
                return weekday == startWeekday
            }
            return parts.byWeekday.contains(weekday)
        case .monthly:
            let months = monthDelta(from: dtstartFloating, to: candidate)
            guard months >= 0, months % parts.interval == 0 else { return false }
            let day = utcCalendar.component(.day, from: candidate)
            let targets = parts.byMonthDay.isEmpty
                ? [utcCalendar.component(.day, from: dtstartFloating)]
                : parts.byMonthDay
            return targets.contains(day)
        case .yearly:
            let years = yearDelta(from: dtstartFloating, to: candidate)
            guard years >= 0, years % parts.interval == 0 else { return false }
            let startComponents = RecurrenceFloatingTime.floatingComponents(from: dtstartFloating)
            let candidateComponents = RecurrenceFloatingTime.floatingComponents(from: candidate)
            return startComponents.month == candidateComponents.month
                && startComponents.day == candidateComponents.day
        }
    }

    private func weekIndexSinceStart(for floating: Date) -> Int {
        let startWeek = startOfWeekMonday(floating: dtstartFloating)
        let candidateWeek = startOfWeekMonday(floating: floating)
        return RecurrenceFloatingTime.daysBetween(start: startWeek, end: candidateWeek) / 7
    }

    private func startOfWeekMonday(floating: Date) -> Date {
        let weekday = RecurrenceFloatingTime.rruleWeekdayIndex(fromFloating: floating)
        return RecurrenceFloatingTime.addDays(to: floating, days: -weekday)
    }

    private func monthDelta(from start: Date, to end: Date) -> Int {
        let startComponents = utcCalendar.dateComponents([.year, .month], from: start)
        let endComponents = utcCalendar.dateComponents([.year, .month], from: end)
        guard let startYear = startComponents.year, let startMonth = startComponents.month,
              let endYear = endComponents.year, let endMonth = endComponents.month
        else {
            return 0
        }
        return (endYear - startYear) * 12 + (endMonth - startMonth)
    }

    private func yearDelta(from start: Date, to end: Date) -> Int {
        let startYear = utcCalendar.component(.year, from: start)
        let endYear = utcCalendar.component(.year, from: end)
        return endYear - startYear
    }

    private var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private static func parseScheduleInstant(
        _ value: String,
        timeZone: TimeZone,
        isAllDay: Bool
    ) -> Date? {
        if isAllDay {
            let parts = value.split(separator: "-")
            guard parts.count == 3,
                  let year = Int(parts[0]),
                  let month = Int(parts[1]),
                  let day = Int(parts[2])
            else {
                return nil
            }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = timeZone
            var components = DateComponents()
            components.year = year
            components.month = month
            components.day = day
            return calendar.date(from: components)
        }
        if value.contains("Z") || value.contains("+") || value.hasSuffix("-00:00") {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) {
                return date
            }
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: value)
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
        return formatter.date(from: value)
    }
}

// MARK: - Parsed rule

private struct ParsedRecurrenceRule: Sendable, Equatable {
    enum Frequency: Sendable {
        case daily
        case weekly
        case monthly
        case yearly
    }

    var frequency: Frequency
    var interval: Int = 1
    var count: Int?
    var untilReal: Date?
    var byWeekday: [Int] = []
    var byMonthDay: [Int] = []

    static func parse(_ line: String) -> ParsedRecurrenceRule? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.uppercased().hasPrefix("RRULE:") else { return nil }
        let body = String(trimmed.dropFirst("RRULE:".count))
        var frequency: Frequency?
        var interval = 1
        var count: Int?
        var untilReal: Date?
        var byWeekday: [Int] = []
        var byMonthDay: [Int] = []

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
            case "COUNT":
                count = Int(value)
            case "UNTIL":
                untilReal = parseUntil(value)
            case "BYDAY":
                byWeekday = value.split(separator: ",").compactMap { weekdayToken in
                    parseWeekday(String(weekdayToken))
                }
            case "BYMONTHDAY":
                byMonthDay = value.split(separator: ",").compactMap { Int($0) }
            default:
                break
            }
        }

        guard let frequency else { return nil }
        return ParsedRecurrenceRule(
            frequency: frequency,
            interval: interval,
            count: count,
            untilReal: untilReal,
            byWeekday: byWeekday,
            byMonthDay: byMonthDay
        )
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
        if let direct = map[upper] {
            return direct
        }
        if upper.count >= 2 {
            let suffix = String(upper.suffix(2))
            return map[suffix]
        }
        return nil
    }
}

private extension ParsedRecurrenceRule.Frequency {
    init?(rawValue: String) {
        switch rawValue {
        case "DAILY": self = .daily
        case "WEEKLY": self = .weekly
        case "MONTHLY": self = .monthly
        case "YEARLY": self = .yearly
        default: return nil
        }
    }
}

// MARK: - Serialization

private enum RecurrenceRuleSerializer {
    static func summary(
        parts: ParsedRecurrenceRule,
        isTimed: Bool,
        timeZone: TimeZone,
        untilFloating: Date?
    ) -> String {
        var tokens: [String] = ["FREQ=\(freqToken(parts.frequency))"]
        if parts.interval > 1 {
            tokens.append("INTERVAL=\(parts.interval)")
        }
        if let count = parts.count, count != RecurrenceConstants.maxRecurrences {
            tokens.append("COUNT=\(count)")
        }
        if !parts.byWeekday.isEmpty {
            tokens.append("BYDAY=\(parts.byWeekday.map(weekdayToken).joined(separator: ","))")
        }
        if !parts.byMonthDay.isEmpty {
            tokens.append("BYMONTHDAY=\(parts.byMonthDay.map(String.init).joined(separator: ","))")
        }
        if parts.untilReal != nil {
            tokens.append(
                "UNTIL=\(formatUntil(parts.untilReal!, isTimed: isTimed, timeZone: timeZone, untilFloating: untilFloating))"
            )
        }
        return "RRULE:" + tokens.joined(separator: ";")
    }

    private static func freqToken(_ frequency: ParsedRecurrenceRule.Frequency) -> String {
        switch frequency {
        case .daily: "DAILY"
        case .weekly: "WEEKLY"
        case .monthly: "MONTHLY"
        case .yearly: "YEARLY"
        }
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

    private static func formatUntil(
        _ untilReal: Date,
        isTimed: Bool,
        timeZone: TimeZone,
        untilFloating: Date?
    ) -> String {
        if !isTimed {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyyMMdd"
            var value = formatter.string(from: untilReal)
            if !value.hasSuffix("Z") {
                value += "Z"
            }
            return value
        }
        guard let untilFloating else {
            return formatUTC(untilReal)
        }
        let components = RecurrenceFloatingTime.floatingComponents(from: untilFloating)
        let basic = String(
            format: "%04d%02d%02dT%02d%02d%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0,
            components.hour ?? 0,
            components.minute ?? 0,
            components.second ?? 0
        )
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyyMMdd'T'HHmmss"
        guard let wall = formatter.date(from: basic) else {
            return formatUTC(untilReal)
        }
        return formatUTC(wall)
    }

    private static func formatUTC(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter.string(from: date)
    }
}
