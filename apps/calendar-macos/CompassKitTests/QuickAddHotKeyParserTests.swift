import CompassKit
import XCTest

final class QuickAddHotKeyParserTests: XCTestCase {
    func testDefaultHotkeyParses() {
        let binding = QuickAddHotKeyParser.parse(QuickAddHotKeyStorage.defaultDisplayString)
        XCTAssertNotNil(binding)
        XCTAssertEqual(binding?.displayString, QuickAddHotKeyStorage.defaultDisplayString)
        XCTAssertNotEqual(binding?.carbonModifiers ?? 0, 0)
    }

    func testPersistenceRoundTrip() {
        let defaults = UserDefaults(suiteName: "QuickAddHotKeyParserTests")!
        defaults.removePersistentDomain(forName: "QuickAddHotKeyParserTests")
        let binding = QuickAddHotKeyParser.defaultBinding
        QuickAddHotKeyStorage.save(binding, to: defaults)
        XCTAssertEqual(QuickAddHotKeyStorage.load(from: defaults), binding)
    }

    func testRejectsBareLetter() {
        XCTAssertNil(QuickAddHotKeyParser.parse("C"))
    }

    func testModifierAliasParsing() {
        let binding = QuickAddHotKeyParser.parse("Command+Control+K")
        XCTAssertNotNil(binding)
        XCTAssertEqual(binding?.keyCode, UInt32(kVK_ANSI_K))
    }
}
