import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelEventJumpTests: XCTestCase {
    func testToggleEventJumpModeShowsQuickTimeSlots() async throws {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment)
        await model.start()
        EffectiveTimeZone.identifier = "UTC"
        model.goToDate(CompassDateParsing.calendarDateInEffectiveTimeZone("2026-05-18")!)
        XCTAssertFalse(model.eventJumpSelection.modeActive)
        model.toggleEventJumpMode()
        XCTAssertTrue(model.eventJumpSelection.modeActive)
        XCTAssertFalse(model.timeGridState.quickTimeSlotHints.isEmpty)
        model.toggleEventJumpMode()
        XCTAssertFalse(model.eventJumpSelection.modeActive)
        XCTAssertTrue(model.timeGridState.quickTimeSlotHints.isEmpty)
    }

    func testShiftDayJumpSelectsMondayColumn() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week

        model.handleShiftDayJump(letter: "M")

        XCTAssertEqual(model.eventJumpSelection.activeDayKeys.count, 1)
        XCTAssertEqual(model.eventJumpSelection.announcement, "Monday selected")
        XCTAssertNotNil(model.eventJumpStatusText)
    }

    func testShiftDayJumpWeekendDisambiguation() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week

        model.handleShiftDayJump(letter: "S")
        XCTAssertEqual(model.eventJumpSelection.dayJumpBuffer, "s")
        XCTAssertEqual(model.eventJumpStatusText, "Shift+U Sunday · Shift+A Saturday · Esc")

        model.handleShiftDayJump(letter: "A")
        XCTAssertEqual(model.eventJumpSelection.announcement, "Saturday selected")
    }

    func testJumpModeTakesBareDayLetters() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        model.toggleEventJumpMode()

        XCTAssertFalse(model.handleEventJumpKeystroke("w"))
        XCTAssertTrue(model.handleEventJumpKeystroke("f"))
        XCTAssertEqual(model.eventJumpSelection.announcement, "Friday selected")

        XCTAssertTrue(model.handleEventJumpKeystroke("s"))
        XCTAssertEqual(model.eventJumpSelection.dayJumpBuffer, "s")
        XCTAssertTrue(model.handleEventJumpKeystroke("u"))
        XCTAssertEqual(model.eventJumpSelection.announcement, "Sunday selected")
    }

    func testJumpModeSwallowsOtherLettersButLeavesEditAndCreate() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        model.toggleEventJumpMode()

        XCTAssertTrue(model.handleEventJumpKeystroke("j"))
        XCTAssertTrue(model.eventJumpSelection.activeDayKeys.isEmpty)
        XCTAssertTrue(model.handleEventJumpKeystroke("f"))
        XCTAssertEqual(model.eventJumpSelection.dayJumpBuffer, "f")
        XCTAssertFalse(model.handleEventJumpKeystroke("e"))
        XCTAssertFalse(model.handleEventJumpKeystroke("c"))
        XCTAssertFalse(model.handleEventJumpKeystroke("w"))
        XCTAssertFalse(model.handleEventJumpKeystroke("d"))
        XCTAssertFalse(model.handleEventJumpKeystroke("l"))
    }

    func testJumpModeLeavesViewSwitchLettersForGridRouter() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .day
        model.toggleEventJumpMode()
        model.handleShortcut(.navWeekView)
        XCTAssertEqual(model.viewStore.view, .week)
        XCTAssertFalse(model.eventJumpSelection.modeActive)
    }

    func testUppercaseDayLettersMatchLowercaseHints() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        model.activateEventJumpMode()
        XCTAssertTrue(model.handleEventJumpKeystroke("F"))
        XCTAssertEqual(model.eventJumpSelection.dayJumpBuffer, "f")
    }

    /// Web: Shift+T then 1230 creates at 12:30 on Tuesday, not today.
    func testFourDigitsAfterADayPickCreateOnThatDay() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        model.handleShiftDayJump(letter: "T")
        for digit in "1230" {
            XCTAssertTrue(model.handleEventJumpDigit(digit))
        }
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        let start = try XCTUnwrap(draft.schedule.start)
        let calendar = EffectiveTimeZone.calendar
        XCTAssertEqual(calendar.component(.hour, from: start), 12)
        XCTAssertEqual(calendar.component(.minute, from: start), 30)
        XCTAssertEqual(CompassDateParsing.formatCalendarDay(start), "2026-06-09")
        XCTAssertFalse(model.eventJumpSelection.isActive)
    }

    func testQuickTimeUsesJumpSelectedDay() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        model.handleShiftDayJump(letter: "M")
        model.handleQuickTimeDigit("1")
        model.handleQuickTimeDigit("1")
        model.commitQuickTimeIfBuffered()
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        let start = try XCTUnwrap(draft.schedule.start)
        let calendar = EffectiveTimeZone.calendar
        XCTAssertEqual(calendar.component(.hour, from: start), 11)
        XCTAssertEqual(CompassDateParsing.formatCalendarDay(start), "2026-06-08")
    }
}
