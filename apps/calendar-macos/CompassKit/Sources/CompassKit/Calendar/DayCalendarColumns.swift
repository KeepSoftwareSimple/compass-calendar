import Foundation

/// Day view column selection parity with `dayCalendarColumns.util.ts`.
public enum DayCalendarColumns {
    public static func dayViewCalendars(
        _ calendars: [CompassCalendar],
        dayKey: String,
        timedEvents: [GridLayoutTimedEventInput],
        allDayEvents: [GridLayoutAllDayEventInput],
        hiddenEventIds: Set<String>,
        pinnedCalendarIds: Set<String> = [],
        defaultTargetCalendarId: String? = nil,
        viewDay: Date? = nil,
        viewDayTimeZone: String? = nil
    ) -> [CompassCalendar] {
        let ordered = eligibleCalendarsInOrder(calendars)
        let viewAnchor =
            viewDay
            ?? CompassDateParsing.calendarDateInEffectiveTimeZone(dayKey)
            ?? .distantPast
        let eventCalendarIds = calendarIdsWithVisibleEventsOnDay(
            dayKey: dayKey,
            viewDay: viewAnchor,
            viewDayTimeZone: viewDayTimeZone,
            timedEvents: timedEvents,
            allDayEvents: allDayEvents,
            hiddenEventIds: hiddenEventIds
        )

        let withEventsOrPinned = ordered.filter { calendar in
            eventCalendarIds.contains(calendar.id) || pinnedCalendarIds.contains(calendar.id)
        }
        if !withEventsOrPinned.isEmpty {
            return withEventsOrPinned
        }

        if let defaultId = defaultTargetCalendarId,
           let match = ordered.first(where: { $0.id == defaultId }) ?? calendars.first(where: { $0.id == defaultId })
        {
            return [match]
        }
        if let primary = ordered.first(where: { $0.isPrimary }) ?? calendars.first(where: { $0.isPrimary }) {
            return [primary]
        }
        if let first = ordered.first ?? calendars.first {
            return [first]
        }
        return []
    }

    /// Legacy entry: all eligible calendars (tests that do not pass events).
    public static func dayViewCalendars(_ calendars: [CompassCalendar]) -> [CompassCalendar] {
        eligibleCalendarsInOrder(calendars)
    }

    private static func eligibleCalendarsInOrder(_ calendars: [CompassCalendar]) -> [CompassCalendar] {
        let eligible = calendars.filter { $0.isActive && $0.isVisible }
        if !eligible.isEmpty {
            return eligible
        }
        if let primary = calendars.first(where: { $0.isPrimary }) {
            return [primary]
        }
        if let first = calendars.first {
            return [first]
        }
        return []
    }

    private static func calendarIdsWithVisibleEventsOnDay(
        dayKey: String,
        viewDay: Date,
        viewDayTimeZone: String?,
        timedEvents: [GridLayoutTimedEventInput],
        allDayEvents: [GridLayoutAllDayEventInput],
        hiddenEventIds: Set<String>
    ) -> Set<String> {
        var ids = Set<String>()
        for timed in timedEvents {
            guard let calendarId = timed.calendarId,
                  !hiddenEventIds.contains(timed.eventId),
                  timedEventOverlapsViewDay(
                    timed,
                    viewDay: viewDay,
                    viewDayTimeZone: viewDayTimeZone
                  )
            else { continue }
            ids.insert(calendarId)
        }
        for allDay in allDayEvents {
            guard let calendarId = allDay.calendarId,
                  !hiddenEventIds.contains(allDay.eventId),
                  isAllDayEventOnDay(
                    startDate: allDay.startDate,
                    endDate: allDay.endDate,
                    dayKey: dayKey
                  )
            else { continue }
            ids.insert(calendarId)
        }
        return ids
    }

    private static func timedEventOverlapsViewDay(
        _ timed: GridLayoutTimedEventInput,
        viewDay: Date,
        viewDayTimeZone: String?
    ) -> Bool {
        let range = CalendarWindowMath.dayEventQueryRange(
            date: viewDay,
            timeZoneIdentifier: viewDayTimeZone
        )
        guard let rangeStart = CompassDateParsing.parseInEffectiveTimeZone(range.startDate),
              let rangeEnd = CompassDateParsing.parseInEffectiveTimeZone(range.endDate)
        else {
            return false
        }
        let eventZone = timed.timeZone ?? EffectiveTimeZone.identifier
        guard let eventStart = CompassDateParsing.parseGridDateTime(
            timed.startDate,
            timeZoneIdentifier: eventZone
        ),
            let eventEnd = CompassDateParsing.parseGridDateTime(
                timed.endDate,
                timeZoneIdentifier: eventZone
            )
        else {
            return false
        }
        return eventStart < rangeEnd && eventEnd > rangeStart
    }

    private static func isAllDayEventOnDay(startDate: String, endDate: String, dayKey: String) -> Bool {
        let eventStart = String(startDate.prefix(10))
        let eventEnd = String(endDate.prefix(10))
        guard let dayStart = CompassDateParsing.calendarDateInEffectiveTimeZone(dayKey),
              let dayEnd = EffectiveTimeZone.calendar.date(byAdding: .day, value: 1, to: dayStart)
        else {
            return false
        }
        let dayEndKey = CompassDateParsing.formatCalendarDay(dayEnd)
        return eventStart < dayEndKey && eventEnd > dayKey
    }
}

extension GridLayoutScenario {
    public func dayViewCalendarsForLayout() -> [CompassCalendar] {
        guard layoutMode == .day, let dayKey = visibleDateKeys.first else {
            return DayCalendarColumns.dayViewCalendars(calendars)
        }
        let viewDay =
            CompassDateParsing.calendarDateInEffectiveTimeZone(dayKey) ?? referenceNow
        return DayCalendarColumns.dayViewCalendars(
            calendars,
            dayKey: dayKey,
            timedEvents: timedEvents,
            allDayEvents: allDayEvents,
            hiddenEventIds: hiddenEventIds,
            pinnedCalendarIds: pinnedDayColumnCalendarIds,
            defaultTargetCalendarId: defaultTargetCalendarId,
            viewDay: viewDay
        )
    }
}
