import XCTest
@testable import CompassKit

final class BookingConnectPromptCopyTests: XCTestCase {
    func testConnectButtonTitles() {
        XCTAssertEqual(BookingConnectPromptCopy.connectButtonTitle(.google), "Connect Google")
        XCTAssertEqual(BookingConnectPromptCopy.connectButtonTitle(.microsoft), "Connect Microsoft")
        XCTAssertEqual(BookingConnectPromptCopy.connectButtonTitle(.apple), "Connect iCloud")
    }
}
