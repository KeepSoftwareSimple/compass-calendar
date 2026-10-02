import CompassKit
import XCTest

final class UpdatePolicyTests: XCTestCase {
    func testChecksEverySixHours() {
        XCTAssertEqual(UpdatePolicy.checkInterval, 21_600)
    }

    func testDisabledWithoutPublicKey() {
        XCTAssertFalse(UpdatePolicy.isEnabled(publicKey: nil))
        XCTAssertFalse(UpdatePolicy.isEnabled(publicKey: ""))
        XCTAssertFalse(UpdatePolicy.isEnabled(publicKey: "  \n"))
    }

    func testStableChannelUsesInfoPlistFeed() {
        XCTAssertNil(UpdatePolicy.feedURLOverride(channel: nil))
        XCTAssertNil(UpdatePolicy.feedURLOverride(channel: ""))
        XCTAssertNil(UpdatePolicy.feedURLOverride(channel: "stable"))
    }

    func testDevChannelUsesDevFeed() {
        XCTAssertTrue(UpdatePolicy.isDevChannel("dev"))
        XCTAssertEqual(UpdatePolicy.feedURLOverride(channel: "dev"), UpdatePolicy.devFeedURL)
    }

    func testEnabledWithPublicKey() {
        XCTAssertTrue(UpdatePolicy.isEnabled(publicKey: "abc123="))
    }
}
