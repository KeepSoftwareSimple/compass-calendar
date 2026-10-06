import Foundation

public enum BookingSettingsFormLogic {
    public static let maxHorizonDays = 60
    public static let maxMinNoticeHours = 60 * 24
    public static let durationOptions: [DurationMinutesEnum] = [.v15, .v30, .v45, .v60]

    public static func defaultWeeklyAvailability() -> [BookingPageWeeklyAvailability] {
        [
            BookingPageWeeklyAvailability(end: "17:00", start: "09:00", weekday: .v1),
            BookingPageWeeklyAvailability(end: "17:00", start: "09:00", weekday: .v2),
            BookingPageWeeklyAvailability(end: "17:00", start: "09:00", weekday: .v3),
            BookingPageWeeklyAvailability(end: "17:00", start: "09:00", weekday: .v4),
            BookingPageWeeklyAvailability(end: "17:00", start: "09:00", weekday: .v5),
        ]
    }

    public static func buildDefaultInput(timeZone: String) -> AdminPutBookingPageInput {
        AdminPutBookingPageInput(
            blockingCalendarIds: [BookingCalendarLogic.placeholderCalendarId],
            destinationCalendarId: BookingCalendarLogic.placeholderCalendarId,
            durationMinutes: .v30,
            enabled: false,
            maxHorizonDays: maxHorizonDays,
            minNoticeHours: 4,
            slug: nil,
            timeZone: timeZone,
            weeklyAvailability: defaultWeeklyAvailability()
        )
    }

    public static func buildInitialForm(
        page: AdminBookingPage?,
        effectiveTimeZone: String,
        writableCalendars: [CompassCalendar],
        availabilityCalendars: [CompassCalendar]
    ) -> AdminPutBookingPageInput {
        let base: AdminPutBookingPageInput = {
            guard let page else {
                return buildDefaultInput(timeZone: effectiveTimeZone)
            }
            switch page {
            case let .saved(saved):
                return AdminPutBookingPageInput(
                    blockingCalendarIds: saved.blockingCalendarIds,
                    destinationCalendarId: saved.destinationCalendarId,
                    durationMinutes: saved.durationMinutes,
                    enabled: saved.enabled,
                    maxHorizonDays: saved.maxHorizonDays,
                    minNoticeHours: saved.minNoticeHours,
                    slug: saved.slug,
                    timeZone: saved.timeZone,
                    weeklyAvailability: saved.weeklyAvailability
                )
            case let .setup(setup):
                return AdminPutBookingPageInput(
                    blockingCalendarIds: setup.blockingCalendarIds,
                    destinationCalendarId: setup.destinationCalendarId,
                    durationMinutes: setup.durationMinutes,
                    enabled: setup.enabled,
                    maxHorizonDays: setup.maxHorizonDays,
                    minNoticeHours: setup.minNoticeHours,
                    slug: setup.isConfigured ? setup.suggestedSlug : nil,
                    timeZone: setup.timeZone,
                    weeklyAvailability: setup.weeklyAvailability
                )
            }
        }()

        let destinationId: String = {
            if !BookingCalendarLogic.isPlaceholderDestination(base.destinationCalendarId),
               writableCalendars.contains(where: { $0.id == base.destinationCalendarId })
               || writableCalendars.isEmpty
            {
                return base.destinationCalendarId
            }
            return writableCalendars.first?.id ?? BookingCalendarLogic.placeholderCalendarId
        }()

        let blockingIds: [String] = {
            if base.blockingCalendarIds == [BookingCalendarLogic.placeholderCalendarId] {
                return BookingCalendarLogic.defaultBlockingCalendarIds(
                    destinationCalendarId: destinationId,
                    calendars: availabilityCalendars
                )
            }
            return base.blockingCalendarIds
        }()

        return AdminPutBookingPageInput(
            blockingCalendarIds: blockingIds,
            destinationCalendarId: destinationId,
            durationMinutes: base.durationMinutes,
            enabled: base.enabled,
            maxHorizonDays: base.maxHorizonDays,
            minNoticeHours: base.minNoticeHours,
            slug: base.slug,
            timeZone: base.timeZone,
            weeklyAvailability: base.weeklyAvailability
        )
    }

    public static func parseBookingCount(_ raw: String, min: Int, max: Int) -> Int? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        guard let value = Int(trimmed), value >= min, value <= max else { return nil }
        return value
    }

    public static func isFormDirty(
        form: AdminPutBookingPageInput,
        baseline: AdminPutBookingPageInput,
        minNoticeText: String,
        horizonText: String
    ) -> Bool {
        if form != baseline { return true }
        return minNoticeText != String(baseline.minNoticeHours)
            || horizonText != String(baseline.maxHorizonDays)
    }

    public static func validateSlug(_ slug: String?) -> String? {
        guard let slug, !slug.isEmpty else {
            return "Use 3 to 32 lowercase letters, digits, or hyphens"
        }
        let pattern = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/
        guard slug.wholeMatch(of: pattern) != nil, !slug.contains("--") else {
            return "Use 3 to 32 lowercase letters, digits, or hyphens"
        }
        return nil
    }

    public static func validateForm(
        form: AdminPutBookingPageInput,
        enabling: Bool,
        minNoticeInvalid: Bool,
        horizonInvalid: Bool,
        writableCalendars: [CompassCalendar]
    ) -> String? {
        if let slugMessage = validateSlug(form.slug) { return slugMessage }
        if minNoticeInvalid || horizonInvalid {
            return "Fix the highlighted number fields before saving."
        }
        if enabling,
           !BookingCalendarLogic.canEnableBookingPage(
               destinationCalendarId: form.destinationCalendarId,
               writableCalendars: writableCalendars
           )
        {
            return "Choose a destination calendar before enabling your meeting page."
        }
        if enabling, form.blockingCalendarIds.isEmpty {
            return "Select at least one blocking calendar."
        }
        if enabling, form.weeklyAvailability.isEmpty {
            return BookingCalendarLogic.availabilityRequiredMessage
        }
        return nil
    }
}
