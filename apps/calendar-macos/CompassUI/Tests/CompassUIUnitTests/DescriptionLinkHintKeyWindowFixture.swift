import AppKit
import SwiftUI
import XCTest
@testable import CompassUI

private final class KeyableDescriptionHintTestWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

/// XCTest-in-bundle hosts often never assign `NSApp.keyWindow` (see CI run 42422375015).
/// Prefer the real key window; otherwise publish the fixture window that owns the editor (hostWindow pattern).
@MainActor
enum DescriptionLinkHintKeyWindowFixture {
    private static var configuredApplication = false

    static func configureApplicationForWindowTests() {
        guard !configuredApplication else { return }
        configuredApplication = true
        _ = NSApplication.shared
        if NSApp.activationPolicy() != .regular {
            NSApp.setActivationPolicy(.regular)
        }
        if !NSApp.isRunning {
            NSApp.finishLaunching()
        }
    }

    /// Production path when possible; otherwise explicit host window for digit-hint lookup only.
    static func publishDigitHintLookupWindow(
        _ window: NSWindow,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        configureApplicationForWindowTests()
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))

        if NSApp.keyWindow === window {
            DescriptionLinkKeyboard.keyWindowForDigitHintLookupWhenTesting = nil
            return
        }

        let editor = findDescriptionEditor(in: window.contentView)
        XCTAssertNotNil(
            editor,
            "Fixture window must host compass-event-form-description before lookup publish",
            file: (file),
            line: line
        )
        DescriptionLinkKeyboard.keyWindowForDigitHintLookupWhenTesting = window
    }

    static func resetDigitHintLookupWindow() {
        DescriptionLinkKeyboard.keyWindowForDigitHintLookupWhenTesting = nil
    }

    static func assertLinkDigitHintsActiveInKeyWindow(
        container: DescriptionEditorContainerView,
        preferredWindow: NSWindow,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        if DescriptionLinkKeyboard.keyWindowForDigitHintLookupWhenTesting == nil {
            XCTAssertIdentical(
                NSApp.keyWindow,
                preferredWindow,
                "NSApp.keyWindow must own description digit hints (router focus guards use NSApp.keyWindow)",
                file: (file),
                line: line
            )
        } else {
            XCTAssertIdentical(
                DescriptionLinkKeyboard.keyWindowForDigitHintLookupWhenTesting,
                preferredWindow,
                "Published lookup window must be the editor host",
                file: (file),
                line: line
            )
            XCTAssertNotIdentical(
                NSApp.keyWindow,
                preferredWindow,
                "Injection is only for hosts that do not key the fixture window",
                file: (file),
                line: line
            )
        }
        XCTAssertTrue(container.descriptionLinkDigitHintsVisible, file: (file), line: line)
        XCTAssertNotNil(DescriptionTextView.findInKeyWindow(), file: (file), line: line)
        XCTAssertTrue(DescriptionTextView.linkDigitHintsActiveInKeyWindow(), file: (file), line: line)
    }

    static func makeBlurredDescriptionLinkHints(
        html: String,
        resetKey: String,
        frame: NSRect = NSRect(x: 0, y: 0, width: 420, height: 140),
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> (container: DescriptionEditorContainerView, window: NSWindow, coordinator: DescriptionEditorView.Coordinator) {
        configureApplicationForWindowTests()
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
            file: (file),
            line: line
        )

        let window = KeyableDescriptionHintTestWindow(
            contentRect: frame,
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.contentView = container
        publishDigitHintLookupWindow(window, file: file, line: line)
        container.updateLinkHintOverlay(visible: true)
        assertLinkDigitHintsActiveInKeyWindow(container: container, preferredWindow: window, file: file, line: line)
        return (container, window, coordinator)
    }

    private static func findDescriptionEditor(in root: NSView?) -> DescriptionTextView? {
        guard let root else { return nil }
        if let editor = root as? DescriptionTextView,
           editor.accessibilityIdentifier() == "compass-event-form-description"
        {
            return editor
        }
        for subview in root.subviews {
            if let found = findDescriptionEditor(in: subview) { return found }
        }
        return nil
    }
}
