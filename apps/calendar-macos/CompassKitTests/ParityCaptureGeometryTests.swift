import CompassKit
import XCTest

final class ParityCaptureGeometryTests: XCTestCase {
    func testContentTrackWidthMatchesWebBootShell() {
        // index.html: track = innerWidth - 32 - (32 + sidebarWidth)
        XCTAssertEqual(ParityCaptureGeometry.viewportHeight, 820)
        XCTAssertEqual(ParityCaptureGeometry.viewportHeight, 820)
        XCTAssertEqual(ParityCaptureGeometry.contentTrackWidth, 871, accuracy: 0.1)
        XCTAssertEqual(ParityCaptureGeometry.visibleDayCount, 5)
    }

    func testTitleBarChromeInsetMatchesParityComposeScript() {
        // Keep in sync with MAC_MAIN_CONTENT_TOP in compose-desktop-parity-shots.py
        XCTAssertEqual(Double(MacTitleBarChromeMetrics.mainContentTopInset), 44, accuracy: 0.1)
    }
}
