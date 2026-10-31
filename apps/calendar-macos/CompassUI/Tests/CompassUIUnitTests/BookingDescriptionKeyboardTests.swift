import AppKit
import SwiftUI
import XCTest
@testable import CompassUI

@MainActor
final class BookingDescriptionKeyboardTests: XCTestCase {
    func testBothBookingLinksSupportKeyboardSelectionAndDestinationHelp() throws {
        let cancel = "https://compass.invalid/meet/host/cancel?token=abc"
        let reschedule = "https://compass.invalid/meet/host/reschedule?token=abc"
        var html = "<p><a href=\"\(cancel)\">Cancel</a> | <a href=\"\(reschedule)\">Reschedule</a></p>"
        let originalHTML = html
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { html }, set: { html = $0 }))
        let container = DescriptionEditorContainerView(frame: NSRect(x: 0, y: 0, width: 480, height: 200))
        let editor = container.textView
        editor.isRichText = true
        editor.isEditable = true
        editor.isSelectable = true
        editor.delegate = coordinator
        coordinator.textView = editor
        coordinator.container = container
        coordinator.suppressLinkHintSlots = true
        let window = NSWindow(contentRect: container.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = container
        defer {
            coordinator.teardown()
            window.orderOut(nil)
            window.close()
        }
        coordinator.load(html: html, resetKey: "booking")
        window.makeKeyAndOrderFront(nil)
        container.layoutSubtreeIfNeeded()
        XCTAssertTrue(window.makeFirstResponder(editor))
        XCTAssertTrue(window.firstResponder === editor)
        XCTAssertEqual(editor.string, "Cancel | Reschedule")

        func arrow(_ characters: String, code: UInt16, modifiers: NSEvent.ModifierFlags) throws {
            let event = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
                modifierFlags: modifiers, timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: window.windowNumber, context: nil, characters: characters,
                charactersIgnoringModifiers: characters, isARepeat: false, keyCode: code))
            window.sendEvent(event)
        }
        editor.setSelectedRange(NSRange(location: 0, length: 0))
        try arrow("\u{F703}", code: 124, modifiers: [.option, .shift])
        XCTAssertEqual(editor.accessibilitySelectedText(), "Cancel")
        let cancelRange = editor.selectedRange()
        XCTAssertEqual(editor.textStorage?.attribute(.link, at: cancelRange.location, effectiveRange: nil) as? URL,
            URL(string: cancel))
        XCTAssertEqual(editor.textStorage?.attribute(.toolTip, at: cancelRange.location, effectiveRange: nil) as? String,
            cancel)

        try arrow("\u{F703}", code: 124, modifiers: [.command])
        try arrow("\u{F702}", code: 123, modifiers: [.option, .shift])
        XCTAssertEqual(editor.accessibilitySelectedText(), "Reschedule")
        let rescheduleRange = editor.selectedRange()
        XCTAssertEqual(editor.textStorage?.attribute(.link, at: rescheduleRange.location, effectiveRange: nil) as? URL,
            URL(string: reschedule))
        XCTAssertEqual(editor.textStorage?.attribute(.toolTip, at: rescheduleRange.location, effectiveRange: nil) as? String,
            reschedule)
        XCTAssertTrue(window.firstResponder === editor)
        XCTAssertEqual(html, originalHTML, "Keyboard navigation must not edit the booking description")
    }
}
