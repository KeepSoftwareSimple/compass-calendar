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
            frame: NSRect(x: 0, y: 0, width: 200, height: 160)
        )
        defer {
            DescriptionLinkHintKeyWindowFixture.resetDigitHintLookupWindow()
            window.close()
        }

        container.layoutSubtreeIfNeeded()
        let narrow = layoutSnapshot(container: container)
        XCTAssertEqual(narrow.chipOriginX.count, 2, "Expected two link hint chips before reflow")

        window.setFrame(NSRect(x: 0, y: 0, width: 560, height: 160), display: true)
        container.layoutSubtreeIfNeeded()
        window.layoutIfNeeded()
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))

        let wide = layoutSnapshot(container: container)
        XCTAssertEqual(wide.chipOriginX.count, 2)
        XCTAssertGreaterThan(wide.containerWidth, narrow.containerWidth + 100, narrow.diagnosticMessage)
        XCTAssertGreaterThan(wide.textContainerWidth, narrow.textContainerWidth + 100, wide.diagnosticMessage)
        XCTAssertNotEqual(
            narrow.chipOriginX,
            wide.chipOriginX,
            "Chip X should change after reflow: narrow=\(narrow.diagnosticMessage) wide=\(wide.diagnosticMessage)"
        )
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

    private struct LinkHintLayoutSnapshot {
        let containerWidth: CGFloat
        let textContainerWidth: CGFloat
        let chipOriginX: [CGFloat]
        let linkMaxX: [CGFloat]

        var diagnosticMessage: String {
            "containerW=\(containerWidth) textContainerW=\(textContainerWidth) chipX=\(chipOriginX) linkMaxX=\(linkMaxX)"
        }
    }

    private func layoutSnapshot(container: DescriptionEditorContainerView) -> LinkHintLayoutSnapshot {
        let editor = container.textView
        let textContainer = editor.textContainer!
        let layoutManager = editor.layoutManager!
        var linkMaxX: [CGFloat] = []
        for entry in editor.orderedLinkAttributeEntries() {
            let glyphRange = layoutManager.glyphRange(forCharacterRange: entry.range, actualCharacterRange: nil)
            layoutManager.ensureLayout(forGlyphRange: glyphRange)
            let rect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
            linkMaxX.append(rect.maxX)
        }
        return LinkHintLayoutSnapshot(
            containerWidth: container.bounds.width,
            textContainerWidth: textContainer.containerSize.width,
            chipOriginX: linkHintDigitChipFrames(in: container).map(\.origin.x),
            linkMaxX: linkMaxX
        )
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
