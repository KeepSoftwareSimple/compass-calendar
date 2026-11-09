import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelEventPastePreviewTests: XCTestCase {
    func testCopyFocusedEventActivatesPastePlacementDraft() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first {
            if case .details(let details) = $0.content { return !details.title.isEmpty }
            return false
        })
        model.focusEvent(eventId: event.id.rawValue)

        model.copyFocusedEvent()

        XCTAssertTrue(model.pastePreviewStore.isActive)
        XCTAssertNotNil(model.eventPastePreviewStatusText)
        XCTAssertEqual(model.draftStore.status.activity, .pastePlace)
        XCTAssertFalse(model.draftStore.status.isFormOpen)
        let overlay = try XCTUnwrap(model.timeGridState.scenario.draftOverlay)
        XCTAssertFalse(overlay.showsInlineTitleEditor)
    }

    func testEscapeEndsPastePreviewWithoutClearingClipboard() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first)
        model.focusEvent(eventId: event.id.rawValue)
        model.copyFocusedEvent()

        model.endEventPastePreview()

        XCTAssertFalse(model.pastePreviewStore.isActive)
        XCTAssertNotNil(model.clipboardStore.event)
        XCTAssertNil(model.timeGridState.scenario.draftOverlay)
    }

    func testPastePlacementOverlayShowsCoralSlotColor() async throws {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        var event = try XCTUnwrap(model.loadedEvents.first {
            if case .details(let details) = $0.content { return !details.title.isEmpty }
            return false
        })
        if case .details(var payload) = event.content {
            payload.color = .coral
            event = Event(
                calendarId: event.calendarId,
                content: .details(payload),
                createdAt: event.createdAt,
                icalUid: event.icalUid,
                id: event.id,
                popupReminderMinutes: event.popupReminderMinutes,
                providerManaged: event.providerManaged,
                recurrence: event.recurrence,
                schedule: event.schedule,
                updatedAt: event.updatedAt
            )
        }
        model.focusEvent(eventId: event.id.rawValue)
        model.copyFocusedEvent()

        let overlay = try XCTUnwrap(model.timeGridState.scenario.draftOverlay)
        XCTAssertFalse(overlay.showsInlineTitleEditor)
        XCTAssertEqual(overlay.colorHex, EventColorSlotHex.hex(for: .coral))
    }

    func testPasteMovesDuplicateAfterArrowNudge() async throws {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first {
            if case .details(let details) = $0.content { return !details.title.isEmpty }
            return false
        })
        let title: String = {
            guard case .details(let details) = event.content else { return "" }
            return details.title
        }()
        model.focusEvent(eventId: event.id.rawValue)
        _ = model.copyFocusedEvent()
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowLeft", shiftKey: false, altKey: false))
        _ = model.pasteCopiedEvent()

        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            let matches = model.loadedEvents.filter {
                guard case .details(let d) = $0.content else { return false }
                return d.title == title
            }
            if matches.count == 2 { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }

        let copies = model.loadedEvents.filter {
            guard case .details(let d) = $0.content else { return false }
            return d.title == title
        }
        XCTAssertEqual(copies.count, 2)
        let originalDay = EventOnTargetDay.startDay(for: event)
        XCTAssertTrue(copies.contains {
            !Calendar.current.isDate(EventOnTargetDay.startDay(for: $0), inSameDayAs: originalDay)
        })
    }
}
