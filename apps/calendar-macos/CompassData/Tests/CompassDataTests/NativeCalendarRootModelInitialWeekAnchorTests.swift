import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelInitialWeekAnchorTests: XCTestCase {
  override func tearDown() async throws {
    CompassDeviceTimeZone.resetIdentifierProviderForTests()
    _ = CompassDevicePreferences.writePinnedTimeZone(nil)
    try await super.tearDown()
  }

    func testInitialWeekAnchorUsesDeviceZoneBeforeViewStore() throws {
        CompassDeviceTimeZone.setIdentifierProviderForTests { "America/Denver" }
        XCTAssertTrue(CompassDevicePreferences.writePinnedTimeZone(nil))

        // Monday 06:00 UTC is Monday 23:00 MST; local day differs from GMT so week anchors diverge.
        let referenceNow = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-11-10T06:00:00.000",
                timeZoneIdentifier: "UTC"
            )
        )
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, now: { referenceNow })

        XCTAssertEqual(EffectiveTimeZone.identifier, "America/Denver")
        let denverAnchor = CalendarWindowMath.sundayWeekViewStart(containing: referenceNow)
        XCTAssertEqual(model.viewStore.anchorDate, denverAnchor)

        EffectiveTimeZone.identifier = "GMT"
        let gmtAnchor = CalendarWindowMath.sundayWeekViewStart(containing: referenceNow)
        XCTAssertNotEqual(denverAnchor, gmtAnchor)
    }

    func testInitialWeekAnchorHonorsPinnedZoneOverDevice() throws {
        CompassDeviceTimeZone.setIdentifierProviderForTests { "GMT" }
        XCTAssertTrue(CompassDevicePreferences.writePinnedTimeZone("America/Chicago"))

        let referenceNow = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-06-15T12:00:00.000",
                timeZoneIdentifier: "UTC"
            )
        )
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, now: { referenceNow })

        XCTAssertEqual(EffectiveTimeZone.identifier, "America/Chicago")
        XCTAssertEqual(
            model.viewStore.anchorDate,
            CalendarWindowMath.sundayWeekViewStart(containing: referenceNow)
        )
    }
}
