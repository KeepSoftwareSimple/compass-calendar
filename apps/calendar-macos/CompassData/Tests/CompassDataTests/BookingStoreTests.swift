import CompassData
import CompassKit
import XCTest

@MainActor
final class BookingStoreTests: XCTestCase {
    func testPreviewSlotStartsUsesFormAvailability() {
        let store = BookingStore(apiClient: CompassAPIClient())
        store.form.weeklyAvailability = [
            BookingPageWeeklyAvailability(end: "12:00", start: "09:00", weekday: .v1),
        ]
        store.form.durationMinutes = .v30
        store.form.minNoticeHours = 0
        store.form.maxHorizonDays = 60
        store.form.timeZone = IANATimeZone(rawValue: "UTC")
        let now = ISO8601DateFormatter().date(from: "2026-09-07T12:00:00Z")!
        let slots = store.previewSlotStarts(now: now)
        XCTAssertFalse(slots.isEmpty)
    }

    func testSetDestinationCalendarIdUpdatesBlockingIds() {
        let store = BookingStore(apiClient: CompassAPIClient())
        let destination = GridLayoutSnapshotFixtures.parityCalendars[0]
        store.form.setDestinationCalendarId(destination.id, calendars: GridLayoutSnapshotFixtures.parityCalendars)
        XCTAssertEqual(store.form.destinationCalendarId, destination.id)
        XCTAssertEqual(
            store.form.blockingCalendarIds,
            BookingCalendarLogic.defaultBlockingCalendarIds(
                destinationCalendarId: destination.id,
                calendars: GridLayoutSnapshotFixtures.parityCalendars
            )
        )
    }
}
