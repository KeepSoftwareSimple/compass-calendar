import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelInitialWeekAnchorTests: XCTestCase {
    func testInitialWeekAnchorUsesDeviceZoneBeforeViewStore() throws {
        let priorDefault = NSTimeZone.default
        defer { NSTimeZone.default = priorDefault }
        NSTimeZone.default = try XCTUnwrap(TimeZone(identifier: "America/Denver"))

        let referenceNow = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-11-12T01:30:00.000",
                timeZoneIdentifier: "UTC"
            )
        )
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, now: { referenceNow })

        let expected = CalendarWindowMath.sundayWeekViewStart(containing: referenceNow)
        XCTAssertEqual(model.viewStore.anchorDate, expected)
        XCTAssertEqual(EffectiveTimeZone.identifier, "America/Denver")
    }
}
