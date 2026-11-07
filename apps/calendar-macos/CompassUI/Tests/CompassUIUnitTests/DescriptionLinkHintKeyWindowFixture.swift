import AppKit
import SwiftUI
import XCTest
@testable import CompassUI

private final class KeyableDescriptionHintTestWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

/// XCTest hosts need an explicit keyable window plus activation before `NSApp.keyWindow` is set.
@MainActor
enum DescriptionLinkHintKeyWindowFixture {
    private static var configuredApplication = false

    @MainActor
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

    @MainActor
    static func activateKeyWindow(_ window: NSWindow, file: StaticString = #filePath, line: UInt = #line) {
        configureApplicationForWindowTests()
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.makeMain()
        window.orderFrontRegardless()
        let deadline = Date().addingTimeInterval(2.0)
        while Date() < deadline, NSApp.keyWindow !== window {
            window.makeKeyAndOrderFront(nil)
            RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.01))
        }
        XCTAssertIdentical(
            NSApp.keyWindow,
            window,
            "NSApp.keyWindow must own the description fixture (matches router focus guards)",
            file: (file),
            line: line
        )
    }

    @MainActor
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
            file: (file), line: line
        )

        let window = KeyableDescriptionHintTestWindow(
            contentRect: frame,
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.contentView = container
        activateKeyWindow(window, file: file, line: line)
        container.updateLinkHintOverlay(visible: true)
        container.layoutSubtreeIfNeeded()

        XCTAssertTrue(container.descriptionLinkDigitHintsVisible, file: (file), line: line)
        XCTAssertNotNil(DescriptionTextView.findInKeyWindow(), file: (file), line: line)
        XCTAssertTrue(DescriptionTextView.linkDigitHintsActiveInKeyWindow(), file: (file), line: line)
        return (container, window, coordinator)
    }
}
