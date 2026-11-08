import AppKit
import SwiftUI
import XCTest
@testable import CompassUI

@MainActor
final class DescriptionLinkHintOverlayTests: XCTestCase {
    func testOrderedLinkAttributeEntriesSkipEmptyLinkValues() {
        let editor = DescriptionTextView()
        let storage = NSMutableAttributedString(string: "Intro ")
        storage.append(NSAttributedString(string: "ghost", attributes: [.link: ""]))
        storage.append(NSAttributedString(string: " then "))
        storage.append(
            NSAttributedString(
                string: "real",
                attributes: [.link: URL(string: "https://real.example/only")!]
            )
        )
        editor.textStorage?.setAttributedString(storage)

        XCTAssertEqual(editor.orderedLinkAttributeEntries().map(\.href), ["https://real.example/only"])

        var opened: [String] = []
        XCTAssertTrue(editor.openDescriptionLink(at: 0, openURL: { opened.append($0.absoluteString) }))
        XCTAssertEqual(opened, ["https://real.example/only"])
    }

    func testLinkHintOverlayChipCountMatchesFilteredLinks() throws {
        let html = "<p>Before <a href=\"https://second.example\">second</a></p>"
        let (container, window, _) = try DescriptionLinkHintKeyWindowFixture.makeBlurredDescriptionLinkHints(
            html: html,
            resetKey: "event",
            frame: NSRect(x: 0, y: 0, width: 400, height: 120)
        )
        defer {
            DescriptionLinkHintKeyWindowFixture.resetDigitHintLookupWindow()
            window.close()
        }

        let editor = container.textView
        let storage = editor.textStorage!
        storage.insert(NSAttributedString(string: "empty ", attributes: [.link: ""]), at: 0)
        container.syncLinkHintSlots(reserved: true)
        container.layoutSubtreeIfNeeded()

        XCTAssertEqual(linkHintDigitChipFrames(in: container).count, 1)

        DescriptionLinkKeyboard.openURLForTests = { url in
            XCTAssertEqual(url.absoluteString, "https://second.example")
        }
        defer { DescriptionLinkKeyboard.openURLForTests = nil }
        _ = DescriptionLinkKeyboard.openNumberedLinkIfHintsActive(digit: 1)
    }

    func testLinkHintChipsRepositionWhenContainerWidthChangesWithoutTogglingHints() throws {
        let html =
            "<p><a href=\"https://one.example/a\">https://one.example/a</a> and "
            + "<a href=\"https://two.example/b\">https://two.example/b</a></p>"
        let (container, window, _) = try DescriptionLinkHintKeyWindowFixture.makeBlurredDescriptionLinkHints(
            html: html,
            resetKey: "event",
            frame: NSRect(x: 0, y: 0, width: 280, height: 140)
        )
        defer {
            DescriptionLinkHintKeyWindowFixture.resetDigitHintLookupWindow()
            window.close()
        }

        container.layoutSubtreeIfNeeded()
        let narrowFrames = linkHintDigitChipFrames(in: container).map(\.origin.x)
        XCTAssertEqual(narrowFrames.count, 2, "Expected two link hint chips before reflow")

        container.frame = NSRect(x: 0, y: 0, width: 520, height: 140)
        window.setContentSize(NSSize(width: 520, height: 140))
        container.layoutSubtreeIfNeeded()
        window.layoutIfNeeded()
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))

        let wideFrames = linkHintDigitChipFrames(in: container).map(\.origin.x)
        XCTAssertEqual(wideFrames.count, 2)
        XCTAssertNotEqual(narrowFrames, wideFrames)
    }

    func testLinkHintChipsRepositionAfterPrefixEditWithoutTogglingHints() throws {
        let html = "<p><a href=\"https://only.example/a\">https://only.example/a</a></p>"
        let (container, window, _) = try DescriptionLinkHintKeyWindowFixture.makeBlurredDescriptionLinkHints(
            html: html,
            resetKey: "event",
            frame: NSRect(x: 0, y: 0, width: 400, height: 120)
        )
        defer {
            DescriptionLinkHintKeyWindowFixture.resetDigitHintLookupWindow()
            window.close()
        }

        container.layoutSubtreeIfNeeded()
        let before = linkHintDigitChipFrames(in: container).map(\.origin.x)
        XCTAssertEqual(before.count, 1)

        container.textView.textStorage?.insert(NSAttributedString(string: "Prefix "), at: 0)
        container.syncLinkHintSlots(reserved: true)
        container.layoutSubtreeIfNeeded()

        let after = linkHintDigitChipFrames(in: container).map(\.origin.x)
        XCTAssertEqual(after.count, 1)
        XCTAssertNotEqual(before, after)
    }

    private func linkHintDigitChipFrames(in root: NSView) -> [CGRect] {
        var frames: [CGRect] = []
        let identifier = root.accessibilityIdentifier()
        if identifier.hasPrefix("compass-description-link-digit-"),
           identifier != "compass-description-link-digit-hints"
        {
            frames.append(root.frame)
        }
        for subview in root.subviews {
            frames.append(contentsOf: linkHintDigitChipFrames(in: subview))
        }
        return frames.sorted { $0.minX < $1.minX }
    }
}
