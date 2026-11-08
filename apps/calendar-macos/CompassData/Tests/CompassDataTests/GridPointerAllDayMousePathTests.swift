import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class GridPointerAllDayMousePathTests: XCTestCase {
    func testAllDaySlotClickParksTargetDayAndShowsHint() async throws {
        let model = try await weekGridModel()
        model.handleGridPointerClick(
            target: .allDaySlot(dateKey: "2026-01-08"),
            registry: model.shortcutRegistry
        )
        XCTAssertEqual(model.pointerDraftDateKey, "2026-01-08")
        XCTAssertTrue(model.pointerHintStore.isVisible)
        XCTAssertEqual(
            model.pointerHintStore.attempt?.message,
            "Press {0} for an all-day event."
        )
    }

    func testCreateAllDayAfterSlotClickUsesParkedColumnDay() async throws {
        let model = try await weekGridModel()
        model.handleGridPointerClick(
            target: .allDaySlot(dateKey: "2026-01-08"),
            registry: model.shortcutRegistry
        )
        model.handleShortcut(.createAllday)
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        XCTAssertEqual(draft.schedule.kind, .allDay)
        let start = draft.schedule.start
        let day = EffectiveTimeZone.calendar.startOfDay(for: start)
        let parked = try XCTUnwrap(
            CompassDateParsing.calendarDateInEffectiveTimeZone("2026-01-08")
        )
        XCTAssertEqual(day, EffectiveTimeZone.calendar.startOfDay(for: parked))
    }

    private func weekGridModel() async throws -> NativeCalendarRootModel {
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil)
        )
        let calendar = CompassCalendar(
            access: .owner,
            backgroundColor: "#ffffff",
            capabilities: .init(
                canInviteAttendees: false,
                canManage: false,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: false,
                canWrite: true,
                conferenceKinds: []
            ),
            description: "",
            foregroundColor: "#000000",
            id: "cal-1",
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Local",
            provider: "local",
            timeZone: "UTC"
        )
        try environment.calendarRepository.upsert(calendars: [calendar])
        let previousTimeZone = EffectiveTimeZone.identifier
        EffectiveTimeZone.identifier = "UTC"
        addTeardownBlock { EffectiveTimeZone.identifier = previousTimeZone }
        let model = NativeCalendarRootModel(environment: environment)
        model.viewStore.setPinnedTimeZone("UTC")
        model.viewStore.anchorDate = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone("2026-01-01T12:00:00.000Z")
        )
        model.settingsStore.setDefaultCalendarId("cal-1")
        await model.start()
        model.authStore.closeModal()
        return model
    }
}
