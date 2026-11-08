import AppKit
import CompassKit
import XCTest

final class NativeKeyEventTests: XCTestCase {
    func testShiftArrowKeyDownNormalizesShiftAndArrowToken() throws {
        let event = try XCTUnwrap(NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: .shift,
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            characters: "",
            charactersIgnoringModifiers: "",
            isARepeat: false,
            keyCode: 125
        ))
        let normalized = try XCTUnwrap(KeyEvent(nsEvent: event))
        XCTAssertTrue(normalized.modifiers.contains(.shift))
        XCTAssertEqual(normalized.key, .named(.arrowDown))
    }

    func testReturnAndKeypadEnterBothReachTheSaveChord() throws {
        for (code, characters) in [(UInt16(36), "\r"), (UInt16(76), "\u{3}"), (UInt16(0), "\r"), (UInt16(0), "\u{3}")] {
            let event = try XCTUnwrap(NSEvent.keyEvent(
                with: .keyDown, location: .zero, modifierFlags: [.command, .numericPad],
                timestamp: 0, windowNumber: 0, context: nil, characters: characters,
                charactersIgnoringModifiers: characters, isARepeat: false, keyCode: code))
            let normalized = try XCTUnwrap(KeyEvent(nsEvent: event))
            XCTAssertEqual(normalized.key, .named(.enter))
            XCTAssertTrue(normalized.matches(KeyChord(modifiers: [.command], token: .named(.enter))))
        }
    }
}
