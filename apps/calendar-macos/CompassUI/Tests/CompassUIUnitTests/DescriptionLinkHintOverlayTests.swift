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
        container.updateLinkHintOverlay(visible: false)
        container.updateLinkHintOverlay(visible: true)
        container.layoutSubtreeIfNeeded()

        let chips = linkHintChipViews(in: container)
        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chips.first?.label, "1")

        DescriptionLinkKeyboard.openURLForTests = { url in
            XCTAssertEqual(url.absoluteString, "https://second.example")
        }
        defer { DescriptionLinkKeyboard.openURLForTests = nil }
        _ = DescriptionLinkKeyboard.openNumberedLinkIfHintsActive(digit: 1)
    }

    func testLinkHintChipsRepositionWhenContainerWidthChanges() throws {
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

        let narrowFrames = linkHintChipFrames(in: container).map(\.origin.x)
        XCTAssertEqual(narrowFrames.count, 2)

        container.frame = NSRect(x: 0, y: 0, width: 520, height: 140)
        window.setContentSize(NSSize(width: 520, height: 140))
        container.layoutSubtreeIfNeeded()
        window.layoutIfNeeded()
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))

        let wideFrames = linkHintChipFrames(in: container).map(\.origin.x)
        XCTAssertEqual(wideFrames.count, 2)
        XCTAssertNotEqual(narrowFrames, wideFrames)
    }

    private func linkHintChipViews(in root: NSView) -> [DescriptionLinkHintChipView] {
        var chips: [DescriptionLinkHintChipView] = []
        if let chip = root as? DescriptionLinkHintChipView { chips.append(chip) }
        for subview in root.subviews {
            chips.append(contentsOf: linkHintChipViews(in: subview))
        }
        return chips
    }

    private func linkHintChipFrames(in root: NSView) -> [CGRect] {
        linkHintChipViews(in: root).map(\.frame)
    }
}
