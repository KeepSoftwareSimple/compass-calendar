import Foundation

public enum EventFormScheduleTimeZoneHint {
    public static func text(
        eventTimeZone: String?,
        scheduleStart: Date,
        scheduleEnd: Date,
        displayTimeZone: String = EffectiveTimeZone.identifier
    ) -> String? {
        guard let eventTimeZone, eventTimeZone != displayTimeZone else { return nil }
        guard let eventZone = TimeZone(identifier: eventTimeZone) else { return nil }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = eventZone
        let startHalf = calendar.component(.hour, from: scheduleStart) < 12 ? "AM" : "PM"
        let endHalf = calendar.component(.hour, from: scheduleEnd) < 12 ? "AM" : "PM"
        func clock(_ date: Date) -> String {
            let hour = calendar.component(.hour, from: date) % 12
            let minute = calendar.component(.minute, from: date)
            let body = "\(hour == 0 ? 12 : hour)" + (minute == 0 ? "" : String(format: ":%02d", minute))
            return body
        }
        let startSuffix = startHalf == endHalf ? "" : " \(startHalf)"
        let range = "\(clock(scheduleStart))\(startSuffix) - \(clock(scheduleEnd)) \(endHalf)"
        let city = TimeZoneFormatting.cityName(for: eventTimeZone)
        return "\(range) \(city)"
    }
}
