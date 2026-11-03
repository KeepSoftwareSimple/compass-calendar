import CompassKit
import XCTest

final class WelcomeKeyboardShortcutsCopyTests: XCTestCase {
    func testRowsMatchWebOnboardingStep() {
        XCTAssertEqual(WelcomeKeyboardShortcutsCopy.title, "Essential shortcuts")
        XCTAssertEqual(WelcomeKeyboardShortcutsCopy.rows.count, 4)
        for row in WelcomeKeyboardShortcutsCopy.rows {
            XCTAssertLessThanOrEqual(row.keycaps.count, 3)
            XCTAssertFalse(row.label.isEmpty)
        }
    }
}
