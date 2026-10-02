import Foundation

public enum GridLayoutScenarioBuilder {
    public static func build(
        layoutMode: GridLayoutMode,
        visibleDateKeys: [String],
        referenceNow: Date,
        calendars: [CompassCalendar],
        events: [Event],
        hiddenEventIds: Set<String> = [],
        demoEventIds: Set<String> = [],
        busyPeriods: [BusyPeriodInput] = []
    ) -> GridLayoutScenario {
        let inputs = CalendarEventViewModel.gridInputs(
            from: events,
            hiddenEventIds: hiddenEventIds,
            demoEventIds: demoEventIds
        )
        return GridLayoutScenario(
            allDayEvents: inputs.allDayEvents,
            busyPeriods: busyPeriods,
            calendars: calendars,
            hiddenEventIds: hiddenEventIds,
            layoutMode: layoutMode,
            referenceNow: referenceNow,
            timedEvents: inputs.timedEvents,
            visibleDateKeys: visibleDateKeys
        )
    }
}
