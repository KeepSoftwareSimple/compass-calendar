import XCTest
@testable import CompassUI

final class TimeGridFocusedAccessibilityNotificationsTests: XCTestCase {
    func testPostsLayoutChangedForProductionProxySync() {
        XCTAssertTrue(
            TimeGridFocusedAccessibilityNotifications.shouldPostLayoutChangedAfterProxySync(
                meetingLinkWideViewport: false,
                proxyIsHidden: false,
                hasWindow: true))
    }

    func testSkipsLayoutChangedForWideViewportUITest() {
        XCTAssertFalse(
            TimeGridFocusedAccessibilityNotifications.shouldPostLayoutChangedAfterProxySync(
                meetingLinkWideViewport: true,
                proxyIsHidden: false,
                hasWindow: true))
    }

    func testSkipsLayoutChangedWhenProxyHiddenOrWindowless() {
        XCTAssertFalse(
            TimeGridFocusedAccessibilityNotifications.shouldPostLayoutChangedAfterProxySync(
                meetingLinkWideViewport: false,
                proxyIsHidden: true,
                hasWindow: true))
        XCTAssertFalse(
            TimeGridFocusedAccessibilityNotifications.shouldPostLayoutChangedAfterProxySync(
                meetingLinkWideViewport: false,
                proxyIsHidden: false,
                hasWindow: false))
    }
}
