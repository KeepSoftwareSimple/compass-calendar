import Foundation

public enum GuestMeetingSetupLogic {
    public static func guestDraftForAuthenticatedHost(
        draft: AdminPutBookingPageInput,
        writableCalendars: [CompassCalendar],
        availabilityCalendars: [CompassCalendar]
    ) -> AdminPutBookingPageInput {
        let destinationCalendarId = writableCalendars.first?.id ?? draft.destinationCalendarId
        let blockingCalendarIds = BookingCalendarLogic.defaultBlockingCalendarIds(
            destinationCalendarId: destinationCalendarId,
            calendars: availabilityCalendars
        )
        return AdminPutBookingPageInput(
            blockingCalendarIds: blockingCalendarIds,
            destinationCalendarId: destinationCalendarId,
            durationMinutes: draft.durationMinutes,
            enabled: draft.enabled,
            maxHorizonDays: draft.maxHorizonDays,
            minNoticeHours: draft.minNoticeHours,
            slug: draft.slug,
            timeZone: draft.timeZone,
            weeklyAvailability: draft.weeklyAvailability
        )
    }
}
