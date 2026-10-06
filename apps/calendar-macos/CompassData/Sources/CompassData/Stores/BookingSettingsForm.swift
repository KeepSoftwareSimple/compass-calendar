import CompassKit
import Foundation

@MainActor
@Observable
public final class BookingSettingsForm {
    public var slug: String?
    public var enabled: Bool
    public var durationMinutes: DurationMinutesEnum
    public var destinationCalendarId: String
    public var blockingCalendarIds: [String]
    public var timeZone: IANATimeZone
    public var weeklyAvailability: [BookingPageWeeklyAvailability]
    public var minNoticeHours: Int
    public var maxHorizonDays: Int

    public init(from input: AdminPutBookingPageInput) {
        slug = input.slug
        enabled = input.enabled
        durationMinutes = input.durationMinutes
        destinationCalendarId = input.destinationCalendarId
        blockingCalendarIds = input.blockingCalendarIds
        timeZone = input.timeZone
        weeklyAvailability = input.weeklyAvailability
        minNoticeHours = input.minNoticeHours
        maxHorizonDays = input.maxHorizonDays
    }

    public var putInput: AdminPutBookingPageInput {
        AdminPutBookingPageInput(
            blockingCalendarIds: blockingCalendarIds,
            destinationCalendarId: destinationCalendarId,
            durationMinutes: durationMinutes,
            enabled: enabled,
            maxHorizonDays: maxHorizonDays,
            minNoticeHours: minNoticeHours,
            slug: slug,
            timeZone: timeZone,
            weeklyAvailability: weeklyAvailability
        )
    }

    public func apply(_ input: AdminPutBookingPageInput) {
        slug = input.slug
        enabled = input.enabled
        durationMinutes = input.durationMinutes
        destinationCalendarId = input.destinationCalendarId
        blockingCalendarIds = input.blockingCalendarIds
        timeZone = input.timeZone
        weeklyAvailability = input.weeklyAvailability
        minNoticeHours = input.minNoticeHours
        maxHorizonDays = input.maxHorizonDays
    }
}
