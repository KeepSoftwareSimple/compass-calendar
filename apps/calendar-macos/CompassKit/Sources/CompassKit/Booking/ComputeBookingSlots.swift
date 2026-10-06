import Foundation

public struct BookingBusyInterval: Sendable, Hashable {
    public var start: Date
    public var end: Date

    public init(start: Date, end: Date) {
        self.start = start
        self.end = end
    }
}

public struct ComputeBookingSlotsInput: Sendable {
    public var timeZone: String
    public var durationMinutes: Int
    public var weeklyAvailability: [BookingPageWeeklyAvailability]
    public var minNoticeHours: Int
    public var maxHorizonDays: Int
    public var busyIntervals: [BookingBusyInterval]
    public var confirmedReservationStarts: [Date]
    public var now: Date
    public var windowStart: Date
    public var windowEnd: Date

    public init(
        timeZone: String,
        durationMinutes: Int,
        weeklyAvailability: [BookingPageWeeklyAvailability],
        minNoticeHours: Int,
        maxHorizonDays: Int,
        busyIntervals: [BookingBusyInterval],
        confirmedReservationStarts: [Date],
        now: Date,
        windowStart: Date,
        windowEnd: Date
    ) {
        self.timeZone = timeZone
        self.durationMinutes = durationMinutes
        self.weeklyAvailability = weeklyAvailability
        self.minNoticeHours = minNoticeHours
        self.maxHorizonDays = maxHorizonDays
        self.busyIntervals = busyIntervals
        self.confirmedReservationStarts = confirmedReservationStarts
        self.now = now
        self.windowStart = windowStart
        self.windowEnd = windowEnd
    }
}

public enum ComputeBookingSlots {
    private static let slotGridMinutes = 15

    public static func mergeBookingBusyIntervals(
        _ intervals: [BookingBusyInterval]
    ) -> [BookingBusyInterval] {
        let sorted = intervals
            .filter { $0.end.timeIntervalSince1970 > $0.start.timeIntervalSince1970 }
            .sorted {
                if $0.start != $1.start { return $0.start < $1.start }
                return $0.end < $1.end
            }
        var merged: [BookingBusyInterval] = []
        for current in sorted {
            guard var last = merged.popLast() else {
                merged.append(current)
                continue
            }
            if current.start.timeIntervalSince1970 <= last.end.timeIntervalSince1970 {
                if current.end > last.end {
                    last.end = current.end
                }
                merged.append(last)
            } else {
                merged.append(last)
                merged.append(current)
            }
        }
        return merged
    }

    public static func computeBookingSlots(_ input: ComputeBookingSlotsInput) -> [String] {
        guard !input.weeklyAvailability.isEmpty else { return [] }
        guard let zone = TimeZone(identifier: input.timeZone) else { return [] }

        let durationMs = TimeInterval(input.durationMinutes * 60_000) / 1000
        let minNoticeMs = TimeInterval(input.minNoticeHours * 60 * 60)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        calendar.locale = Locale(identifier: "en_US_POSIX")

        let horizonEnd =
            calendar.date(byAdding: .day, value: input.maxHorizonDays, to: input.now)
            ?? input.now

        let reservationIntervals = input.confirmedReservationStarts.map {
            BookingBusyInterval(start: $0, end: Date(timeInterval: durationMs, since: $0))
        }
        let blockedIntervals = mergeBookingBusyIntervals(
            input.busyIntervals + reservationIntervals
        )

        var slots: [String] = []
        var seenStarts = Set<Int>()

        var dayCursor = startOfDay(input.windowStart, calendar: calendar, zone: zone)
        let lastDay = startOfDay(input.windowEnd, calendar: calendar, zone: zone)

        while dayCursor <= lastDay {
            let weekday = isoWeekday(dayCursor, calendar: calendar)
            let localDate = formatLocalDate(dayCursor, calendar: calendar, zone: zone)
            let dayAvailability = input.weeklyAvailability.filter { $0.weekday.rawValue == weekday }

            for interval in dayAvailability {
                var minuteCursor = localTimeToMinutes(interval.start)
                let intervalEndMinutes = localTimeToMinutes(interval.end)

                while minuteCursor + input.durationMinutes <= intervalEndMinutes {
                    let hours = minuteCursor / 60
                    let minutes = minuteCursor % 60
                    let wallStart = String(
                        format: "%@ %02d:%02d",
                        localDate,
                        hours,
                        minutes
                    )
                    guard let localStart = localWallInstant(wallStart, calendar: calendar, zone: zone)
                    else {
                        minuteCursor += slotGridMinutes
                        continue
                    }

                    let slotStart = localStart
                    let slotEnd = Date(timeInterval: durationMs, since: slotStart)
                    let endMinutes = localMinutes(slotEnd, calendar: calendar, zone: zone)
                    let slotLocalDate = formatLocalDate(slotEnd, calendar: calendar, zone: zone)
                    if slotLocalDate != localDate || endMinutes > intervalEndMinutes {
                        minuteCursor += slotGridMinutes
                        continue
                    }

                    let slotStartMs = Int(slotStart.timeIntervalSince1970 * 1000)
                    let slotStartSeconds = slotStart.timeIntervalSince1970
                    if slotStartSeconds >= input.windowStart.timeIntervalSince1970,
                       slotStartSeconds < input.windowEnd.timeIntervalSince1970,
                       slotStartSeconds >= input.now.timeIntervalSince1970 + minNoticeMs,
                       slotStartSeconds < horizonEnd.timeIntervalSince1970,
                       !isSlotBlocked(slotStart, slotEnd, blockedIntervals),
                       !seenStarts.contains(slotStartMs)
                    {
                        seenStarts.insert(slotStartMs)
                        slots.append(formatSlotUTC(slotStart))
                    }

                    minuteCursor += slotGridMinutes
                }
            }

            dayCursor =
                calendar.date(byAdding: .day, value: 1, to: dayCursor)
                ?? dayCursor.addingTimeInterval(86_400)
        }

        return slots.sorted()
    }

    private static func localTimeToMinutes(_ time: String) -> Int {
        let parts = time.split(separator: ":")
        guard parts.count == 2,
              let hours = Int(parts[0]),
              let minutes = Int(parts[1])
        else { return 0 }
        return hours * 60 + minutes
    }

    private static func isoWeekday(_ date: Date, calendar: Calendar) -> Int {
        let weekday = calendar.component(.weekday, from: date)
        return weekday == 1 ? 7 : weekday - 1
    }

    private static func startOfDay(_ date: Date, calendar: Calendar, zone: TimeZone) -> Date {
        var cal = calendar
        cal.timeZone = zone
        return cal.startOfDay(for: date)
    }

    private static func formatLocalDate(_ date: Date, calendar: Calendar, zone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = zone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func localMinutes(_ date: Date, calendar: Calendar, zone: TimeZone) -> Int {
        var cal = calendar
        cal.timeZone = zone
        let hour = cal.component(.hour, from: date)
        let minute = cal.component(.minute, from: date)
        return hour * 60 + minute
    }

    private static func localWallInstant(
        _ wallStart: String,
        calendar: Calendar,
        zone: TimeZone
    ) -> Date? {
        let parts = wallStart.split(separator: " ", omittingEmptySubsequences: true)
        guard parts.count == 2 else { return nil }
        let dateParts = parts[0].split(separator: "-")
        let timeParts = parts[1].split(separator: ":")
        guard dateParts.count == 3,
              timeParts.count == 2,
              let year = Int(dateParts[0]),
              let month = Int(dateParts[1]),
              let day = Int(dateParts[2]),
              let hour = Int(timeParts[0]),
              let minute = Int(timeParts[1])
        else { return nil }

        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        components.second = 0

        var cal = calendar
        cal.timeZone = zone
        guard let date = cal.date(from: components) else { return nil }

        let formatter = DateFormatter()
        formatter.calendar = cal
        formatter.timeZone = zone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        guard formatter.string(from: date) == wallStart else { return nil }
        return date
    }

    private static func slotOverlapsBlockedInterval(
        slotStart: Date,
        slotEnd: Date,
        blockedStart: Date,
        blockedEnd: Date
    ) -> Bool {
        slotStart.timeIntervalSince1970 < blockedEnd.timeIntervalSince1970
            && slotEnd.timeIntervalSince1970 > blockedStart.timeIntervalSince1970
    }

    private static func isSlotBlocked(
        _ slotStart: Date,
        _ slotEnd: Date,
        _ blockedIntervals: [BookingBusyInterval]
    ) -> Bool {
        blockedIntervals.contains {
            slotOverlapsBlockedInterval(
                slotStart: slotStart,
                slotEnd: slotEnd,
                blockedStart: $0.start,
                blockedEnd: $0.end
            )
        }
    }

    private static func formatSlotUTC(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}
