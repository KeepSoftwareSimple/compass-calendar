import CompassKit
import Foundation

/// Uses the same compact 12-hour range as the web card, in the active grid zone.
enum EventCardTimeLabel {
    static func text(for card: GridLayoutCardSnapshot, state: TimeGridState) -> String? {
        guard card.kind == .timed else { return nil }
        let start: Date
        let end: Date
        if let draft = state.scenario.draftOverlay, draft.eventId == card.eventId {
            start = draft.schedule.start
            end = draft.schedule.end
        } else {
            guard let event = state.scenario.timedEvents.first(where: { $0.eventId == card.eventId })
            else { return nil }
            let eventZone = event.timeZone ?? state.effectiveTimeZone
            guard let eventStart = CompassDateParsing.parseGridDateTime(
                event.startDate, timeZoneIdentifier: eventZone),
                let eventEnd = CompassDateParsing.parseGridDateTime(
                    event.endDate, timeZoneIdentifier: eventZone)
            else { return nil }
            start = eventStart
            end = eventEnd
        }
        guard card.isDraft || end >= state.referenceNow else { return nil }
        let gridZone = TimeZone(identifier: state.effectiveTimeZone) ?? EffectiveTimeZone.timeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = gridZone
        let startHalf = calendar.component(.hour, from: start) < 12 ? "AM" : "PM"
        let endHalf = calendar.component(.hour, from: end) < 12 ? "AM" : "PM"
        func clock(_ date: Date) -> String {
            let hour = calendar.component(.hour, from: date) % 12
            let minute = calendar.component(.minute, from: date)
            return "\(hour == 0 ? 12 : hour)" + (minute == 0 ? "" : String(format: ":%02d", minute))
        }
        let startSuffix = startHalf == endHalf ? "" : " \(startHalf)"
        return "\(clock(start))\(startSuffix) - \(clock(end)) \(endHalf)"
    }
}
