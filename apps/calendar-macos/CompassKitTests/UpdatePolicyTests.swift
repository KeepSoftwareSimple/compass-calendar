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

    func testEnabledWithPublicKey() {
        XCTAssertTrue(UpdatePolicy.isEnabled(publicKey: "abc123="))
    }
}
