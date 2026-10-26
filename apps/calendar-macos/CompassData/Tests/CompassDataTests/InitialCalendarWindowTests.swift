import CompassData
import CompassKit
import XCTest

@MainActor
final class InitialCalendarWindowTests: XCTestCase {
    func testInitialWindowAndTodayIncludeReferenceDayAtEveryWidth() throws {
        for width: CGFloat in [320, 700, 1170] {
            let model = try makeModel()
            model.updateContentTrackWidth(width)
            XCTAssertGreaterThanOrEqual(model.referenceNow, model.startOfView)
            XCTAssertLessThanOrEqual(EffectiveTimeZone.calendar.startOfDay(for: model.referenceNow), model.endOfView)
            if model.viewStore.visibleDayCount == 1 {
                XCTAssertTrue(EffectiveTimeZone.calendar.isDate(model.startOfView, inSameDayAs: model.referenceNow))
            }
            model.handleShortcut(.navNext)
            model.handleShortcut(.navToday)
            XCTAssertGreaterThanOrEqual(model.referenceNow, model.startOfView)
            XCTAssertLessThanOrEqual(EffectiveTimeZone.calendar.startOfDay(for: model.referenceNow), model.endOfView)
        }
    }

    func testInitialSizingAndResizePreserveAnExplicitlyChosenDate() throws {
        let model = try makeModel()
        let chosen = model.referenceNow.addingTimeInterval(-20 * 86400)
        model.viewStore.setAnchorDate(chosen)
        model.updateContentTrackWidth(320)
        XCTAssertEqual(model.viewStore.anchorDate, chosen)
        model.updateContentTrackWidth(1170)
        XCTAssertEqual(model.viewStore.anchorDate, chosen)
    }

    private func makeModel() throws -> NativeCalendarRootModel {
        let environment = try NativeCalendarEnvironment(appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true, sessionStore: MemorySessionStore())
        // Friday, late enough in the week to fall outside an unshifted partial window.
        return NativeCalendarRootModel(environment: environment,
            now: { Date(timeIntervalSince1970: 1_792_756_800) })
    }
}
