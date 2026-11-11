import CompassKit
import XCTest

final class DayJumpPrefixesTests: XCTestCase {
    func testMondayPrefix() {
        XCTAssertEqual(DayJumpPrefixes.prefix(forWeekday: 1), "m")
        XCTAssertEqual(DayJumpPrefixes.dayPrefix(forShiftedLetter: "M"), "m")
    }

    func testColumnChipLabelsMatchMacJumpRouting() {
        XCTAssertEqual(
            DayJumpPrefixes.columnJumpChipLabel(prefix: "su", eventJumpModeActive: true),
            "su")
        XCTAssertEqual(
            DayJumpPrefixes.columnJumpChipLabel(prefix: "w", eventJumpModeActive: true),
            "⇧w")
        XCTAssertEqual(
            DayJumpPrefixes.columnJumpChipLabel(prefix: "w", eventJumpModeActive: false),
            "⇧w")
    }

    func testEventJumpChipLabelsAdvertiseShiftForWednesdayHints() {
        XCTAssertEqual(DayJumpPrefixes.eventJumpChipLabel(hint: "m2"), "m2")
        XCTAssertEqual(DayJumpPrefixes.eventJumpChipLabel(hint: "w1"), "⇧w1")
        XCTAssertEqual(DayJumpPrefixes.eventJumpChipLabel(hint: "w10"), "⇧w10")
    }

    func testShiftDecoratedPrefixesTrackViewNavigationFallthrough() {
        XCTAssertEqual(DayJumpPrefixes.shiftDecoratedJumpPrefixes, Set(["w"]))
        for letter in DayJumpPrefixes.viewNavigationFallthroughLetters {
            let lowercase = String(letter).lowercased()
            if let dayPrefix = DayJumpPrefixes.dayPrefix(forShiftedLetter: letter), dayPrefix == lowercase {
                XCTAssertTrue(
                    DayJumpPrefixes.shiftDecoratedJumpPrefixes.contains(lowercase),
                    "Expected \(lowercase) in shift-decorated set")
            }
        }
    }
}
