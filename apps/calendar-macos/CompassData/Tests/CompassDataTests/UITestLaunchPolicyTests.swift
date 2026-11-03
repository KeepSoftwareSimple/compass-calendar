import XCTest
@testable import CompassData

final class UITestLaunchPolicyTests: XCTestCase {
    func testProductionLaunchAttachesNoAccessibilityProbes() {
        XCTAssertFalse(UITestLaunchPolicy.attachesAccessibilityProbes(arguments: ["/Applications/Compass.app"]))
        XCTAssertFalse(
            UITestLaunchPolicy.attachesAccessibilityProbes(
                arguments: ["Compass", "-COMPASS_FIXTURE", "demo", "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK"]))
    }

    func testProductionLaunchNeverMirrorsEventFormTitleTyping() {
        XCTAssertFalse(UITestLaunchPolicy.mirrorsEventFormTitleTyping(arguments: ["/Applications/Compass.app"]))
        XCTAssertFalse(
            UITestLaunchPolicy.mirrorsEventFormTitleTyping(
                arguments: ["Compass", "-COMPASS_UI_TEST", "-COMPASS_FIXTURE", "demo"]))
        XCTAssertTrue(
            UITestLaunchPolicy.mirrorsEventFormTitleTyping(
                arguments: ["Compass", "-COMPASS_UI_TEST", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM"]))
    }

    func testOnlyInteractionTestsSuppressSystemNotificationSideEffects() {
        XCTAssertTrue(UITestLaunchPolicy.allowsSystemNotifications(arguments: ["/Applications/Compass.app"]))
        XCTAssertTrue(UITestLaunchPolicy.allowsSystemNotifications(arguments: ["Compass", "-COMPASS_FIXTURE", "demo"]))
        XCTAssertFalse(UITestLaunchPolicy.allowsSystemNotifications(arguments: ["Compass", "-COMPASS_UI_TEST"]))
    }

    func testUITestLaunchAttachesAccessibilityProbes() {
        XCTAssertTrue(
            UITestLaunchPolicy.attachesAccessibilityProbes(arguments: ["Compass", "-COMPASS_UI_TEST"]))
    }

    func testUITestAndParityLaunchesDoNotCaptureProductAnalytics() {
        XCTAssertTrue(UITestLaunchPolicy.capturesProductAnalytics(arguments: ["/Applications/Compass.app"]))
        XCTAssertFalse(
            UITestLaunchPolicy.capturesProductAnalytics(arguments: ["Compass", "-COMPASS_UI_TEST"]))
        XCTAssertFalse(
            UITestLaunchPolicy.capturesProductAnalytics(
                arguments: ["Compass", "-COMPASS_UI_TEST_PARITY_CAPTURE"]))
    }
}
