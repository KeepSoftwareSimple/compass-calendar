import AppKit
import SwiftUI
import XCTest
@testable import CompassUI

/// XCTest hosts do not reliably make a new `NSWindow` key without activation policy + run loop.
enum DescriptionLinkHintKeyWindowFixture {
    @MainActor
    static func activateKeyWindow(_ window: NSWindow, file: StaticString = #file, line: UInt = #line) {
        if NSApp.activationPolicy() != .regular {
            NSApp.setActivationPolicy(.regular)
        }
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        let deadline = Date().addingTimeInterval(0.5)
        while Date() < deadline, NSApp.keyWindow !== window {
            RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.01))
        }
        XCTAssertIdentical(
            NSApp.keyWindow, window,
            "Key window required for linkDigitHintsActiveInKeyWindow()",
            file: file,
            line: line
        )
    }

    @MainActor
    static func makeBlurredDescriptionLinkHints(
        html: String,
        resetKey: String,
        frame: NSRect = NSRect(x: 0, y: 0, width: 420, height: 140),
        file: StaticString = #file,
        line: UInt = #line
    ) throws -> (container: DescriptionEditorContainerView, window: NSWindow, coordinator: DescriptionEditorView.Coordinator) {
        var bound = html
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { bound }, set: { bound = $0 }))
        let container = DescriptionEditorContainerView(frame: frame)
        let editor = container.textView
        editor.isEditable = true
        coordinator.textView = editor
        coordinator.container = container
        editor.delegate = coordinator
        coordinator.load(html: html, resetKey: resetKey)
        coordinator.wasDescriptionFocused = true
        coordinator.syncPresentationOnFocusChange(isFocused: false, html: html, resetKey: resetKey)
        XCTAssertTrue(
            coordinator.shouldShowLinkHintOverlay(isFocused: false, html: html, isEditable: true),
            file: file,
            line: line
        )

        let window = NSWindow(contentRect: frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = container
        activateKeyWindow(window, file: file, line: line)
        container.updateLinkHintOverlay(visible: true)
        container.layoutSubtreeIfNeeded()

        XCTAssertTrue(container.descriptionLinkDigitHintsVisible, file: file, line: line)
        XCTAssertNotNil(DescriptionTextView.findInKeyWindow(), file: file, line: line)
        XCTAssertTrue(DescriptionTextView.linkDigitHintsActiveInKeyWindow(), file: file, line: line)
        return (container, window, coordinator)
    }
}
