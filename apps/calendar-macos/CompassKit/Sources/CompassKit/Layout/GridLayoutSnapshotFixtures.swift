import Foundation

public enum GridLayoutSnapshotFixtures {
    public static let referenceNow: Date = {
        CompassDateParsing.parseInEffectiveTimeZone("2026-05-20T15:00:00.000Z")!
    }()

    public static let parityCalendars: [CompassCalendar] = [
        CompassCalendar(
            access: .owner,
            accountEmail: nil,
            backgroundColor: "#3b82f6",
            capabilities: CompassCalendarCapabilities(
                canInviteAttendees: true,
                canManage: true,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: true,
                canWrite: true,
                conferenceKinds: []
            ),
            conference: nil,
            createsGoogleMeet: nil,
            description: "",
            foregroundColor: "#ffffff",
            id: "507f1f77bcf86cd799439011",
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Work",
            provider: "local",
            timeZone: "UTC"
        ),
        CompassCalendar(
            access: .owner,
            accountEmail: nil,
            backgroundColor: "#22c55e",
            capabilities: CompassCalendarCapabilities(
                canInviteAttendees: true,
                canManage: true,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: true,
                canWrite: true,
                conferenceKinds: []
            ),
            conference: nil,
            createsGoogleMeet: nil,
            description: "",
            foregroundColor: "#ffffff",
            id: "507f1f77bcf86cd799439012",
            isActive: true,
            isPrimary: false,
            isVisible: true,
            name: "Personal",
            provider: "local",
            timeZone: "UTC"
        ),
    ]

    public static func parityScenario(
        layoutMode: GridLayoutMode,
        visibleDateKeys: [String]
    ) -> GridLayoutScenario {
        GridLayoutScenario(
            allDayEvents: [
                GridLayoutAllDayEventInput(
                    calendarId: "507f1f77bcf86cd799439011",
                    endDate: "2026-05-22",
                    eventId: "all-day-span",
                    row: 1,
                    startDate: "2026-05-19",
                    title: "All-day span"
                ),
            ],
            busyPeriods: [
                BusyPeriodInput(
                    calendarId: "507f1f77bcf86cd799439011",
                    start: "2026-05-20T10:30:00.000Z",
                    end: "2026-05-20T11:30:00.000Z"
                ),
            ],
            calendars: parityCalendars,
            hiddenEventIds: ["hidden-strip"],
            layoutMode: layoutMode,
            referenceNow: referenceNow,
            timedEvents: [
                GridLayoutTimedEventInput(
                    calendarId: "507f1f77bcf86cd799439011",
                    endDate: "2026-05-20T10:00:00.000",
                    eventId: "overlap-a",
                    startDate: "2026-05-20T09:00:00.000",
                    title: "Overlap A"
                ),
                GridLayoutTimedEventInput(
                    calendarId: "507f1f77bcf86cd799439011",
                    endDate: "2026-05-20T10:30:00.000",
                    eventId: "overlap-b",
                    startDate: "2026-05-20T09:30:00.000",
                    title: "Overlap B"
                ),
                GridLayoutTimedEventInput(
                    calendarId: "507f1f77bcf86cd799439012",
                    endDate: "2026-05-20T12:00:00.000",
                    eventId: "hidden-strip",
                    startDate: "2026-05-20T11:00:00.000",
                    title: "Hidden"
                ),
            ],
            visibleDateKeys: visibleDateKeys
        )
    }
}
