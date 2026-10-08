import Foundation

public enum BookingWeeklyHours {
    public static let timeOptions: [String] = {
        var values: [String] = []
        for minutes in stride(from: 0, through: 23 * 60 + 45, by: 15) {
            let hours = minutes / 60
            let remainder = minutes % 60
            values.append(String(format: "%02d:%02d", hours, remainder))
        }
        return values
    }()

    public static func intervalsForDay(
        _ value: [BookingPageWeeklyAvailability],
        weekday: WeekdayEnum
    ) -> [BookingPageWeeklyAvailability] {
        value
            .filter { $0.weekday == weekday }
            .sorted { $0.start < $1.start }
    }

    public static func setDayAvailable(
        _ value: [BookingPageWeeklyAvailability],
        weekday: WeekdayEnum,
        available: Bool
    ) -> [BookingPageWeeklyAvailability] {
        if !available {
            return sortAvailability(value.filter { $0.weekday != weekday })
        }
        if !intervalsForDay(value, weekday: weekday).isEmpty {
            return sortAvailability(value)
        }
        return sortAvailability(
            value + [
                BookingPageWeeklyAvailability(
                    end: "17:00",
                    start: "09:00",
                    weekday: weekday
                ),
            ]
        )
    }

    public static func updateBlock(
        _ value: [BookingPageWeeklyAvailability],
        weekday: WeekdayEnum,
        index: Int,
        start: String? = nil,
        end: String? = nil
    ) -> [BookingPageWeeklyAvailability] {
        var dayIntervals = intervalsForDay(value, weekday: weekday)
        guard dayIntervals.indices.contains(index) else { return value }
        var block = dayIntervals[index]
        if let start { block = BookingPageWeeklyAvailability(end: block.end, start: start, weekday: weekday) }
        if let end { block = BookingPageWeeklyAvailability(end: end, start: block.start, weekday: weekday) }
        dayIntervals[index] = block
        return withDayIntervals(value, weekday: weekday, intervals: dayIntervals)
    }

    private static func withDayIntervals(
        _ value: [BookingPageWeeklyAvailability],
        weekday: WeekdayEnum,
        intervals: [BookingPageWeeklyAvailability]
    ) -> [BookingPageWeeklyAvailability] {
        sortAvailability(value.filter { $0.weekday != weekday } + intervals)
    }

    private static func sortAvailability(
        _ value: [BookingPageWeeklyAvailability]
    ) -> [BookingPageWeeklyAvailability] {
        value.sorted {
            if $0.weekday.rawValue != $1.weekday.rawValue {
                return $0.weekday.rawValue < $1.weekday.rawValue
            }
            return $0.start < $1.start
        }
    }
}
