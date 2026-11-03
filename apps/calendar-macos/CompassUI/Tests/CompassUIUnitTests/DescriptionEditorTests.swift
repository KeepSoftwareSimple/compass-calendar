import AppKit
import CompassKit
import SwiftUI
import XCTest
@testable import CompassUI

@MainActor
final class DescriptionEditorTests: XCTestCase {
    func testFormattingImmediatelyUpdatesBoundHTMLWithoutTyping() {
        var html = "<p>Selected</p>"
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { html }, set: { html = $0 }))
        let editor = DescriptionTextView()
        coordinator.textView = editor
        editor.delegate = coordinator
        coordinator.load(html: html, resetKey: "event")
        editor.setSelectedRange(NSRange(location: 0, length: 8))

        editor.toggleFontTrait(.boldFontMask)
        XCTAssertEqual(html, "<p><strong>Selected</strong></p>")
        editor.toggleFontTrait(.italicFontMask)
        XCTAssertEqual(html, "<p><strong><em>Selected</em></strong></p>")
        editor.applyLink(URL(string: "https://example.com")!, to: editor.selectedRange())
        XCTAssertEqual(html, "<p><a href=\"https://example.com\"><strong><em>Selected</em></strong></a></p>")
    }

    func testCaretFormattingSurvivesThemeUpdates() {
        let coordinator = DescriptionEditorView.Coordinator(html: .constant(""))
        let editor = DescriptionTextView()
        coordinator.textView = editor
        editor.toggleFontTrait(.boldFontMask)
        coordinator.applyTheme(.darkAbyss)
        let font = editor.typingAttributes[.font] as? NSFont
        XCTAssertTrue(font.map { NSFontManager.shared.traits(of: $0).contains(.boldFontMask) } ?? false)
        editor.toggleFontTrait(.boldFontMask)
        XCTAssertFalse(NSFontManager.shared.traits(of: editor.typingAttributes[.font] as! NSFont).contains(.boldFontMask))
    }

    func testPartialSelectionBulletsOnlySelectedLinesInHardBreakParagraph() {
        var html =
            "<p>LIST<br>- Frames<br>- Art supplies</p><p>PLACES<br>Magpie Art Supply, LLC<br>Paper and Grace<br>Sacks Thrift Store<br>Salvation Army<br>UFS BZN</p>"
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { html }, set: { html = $0 }))
        let editor = DescriptionTextView()
        coordinator.textView = editor
        editor.delegate = coordinator
        coordinator.load(html: html, resetKey: "event")
        let text = editor.string as NSString
        let start = text.range(of: "Magpie Art Supply, LLC").location
        let end = NSMaxRange(text.range(of: "UFS BZN"))
        editor.setSelectedRange(NSRange(location: start, length: end - start))

        editor.toggleList(ordered: false)
        XCTAssertTrue(html.contains("<ul>"))
        XCTAssertEqual(html.components(separatedBy: "<li>").count - 1, 5)
        XCTAssertTrue(html.contains("PLACES"))
        XCTAssertTrue(html.contains("<p>LIST<br>- Frames<br>- Art supplies</p>"))

        editor.toggleList(ordered: false)
        XCTAssertFalse(html.contains("<ul>"))
        XCTAssertTrue(html.contains("Magpie Art Supply, LLC"))
    }

    func testListButtonsPreserveInlineFormattingAndToggleBackToParagraphs() {
        var html = "<p><strong>🌴 First</strong></p><p>Second</p>"
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { html }, set: { html = $0 }))
        let editor = DescriptionTextView()
        coordinator.textView = editor
        editor.delegate = coordinator
        coordinator.load(html: html, resetKey: "event")
        editor.setSelectedRange(NSRange(location: 0, length: (editor.string as NSString).length))

        editor.toggleList(ordered: false)
        XCTAssertEqual(html, "<ul><li><p><strong>🌴 First</strong></p></li><li><p>Second</p></li></ul>")
        editor.toggleList(ordered: true)
        XCTAssertEqual(html, "<ol><li><p><strong>🌴 First</strong></p></li><li><p>Second</p></li></ol>")
        editor.toggleList(ordered: true)
        XCTAssertEqual(html, "<p><strong>🌴 First</strong></p><p>Second</p>")
    }

    func testEmptyParagraphCanBecomeAListWithoutMovingCaretIntoPrefix() {
        let editor = DescriptionTextView()
        editor.setSelectedRange(NSRange(location: 0, length: 0))
        editor.toggleList(ordered: false)
        XCTAssertEqual(editor.string, "• ")
        XCTAssertEqual(editor.selectedRange(), NSRange(location: 2, length: 0))
        editor.toggleList(ordered: false)
        XCTAssertEqual(editor.string, "")
        XCTAssertEqual(editor.selectedRange(), NSRange(location: 0, length: 0))
    }

    func testEnterContinuesListAndEmptyItemExitsIt() {
        let editor = DescriptionTextView()
        editor.textStorage?.setAttributedString(NSAttributedString(string: "First"))
        editor.setSelectedRange(NSRange(location: 5, length: 0))
        editor.toggleList(ordered: true)
        editor.insertNewline(nil)
        XCTAssertEqual(editor.string, "1. First\n2. ")
        editor.insertText("Second", replacementRange: editor.selectedRange())
        editor.insertNewline(nil)
        XCTAssertEqual(editor.string, "1. First\n2. Second\n3. ")
        editor.insertNewline(nil)
        XCTAssertEqual(editor.string, "1. First\n2. Second\n")
        XCTAssertNil(editor.typingAttributes[HTMLFragmentAppKit.listKindKey])
    }

    func testInsertingAnOrderedItemRenumbersFollowingItems() {
        let coordinator = DescriptionEditorView.Coordinator(html: .constant(""))
        let editor = DescriptionTextView()
        coordinator.textView = editor
        coordinator.load(html: "<ol><li><p>First</p></li><li><p><strong>Second</strong></p></li></ol><p>Separate</p>", resetKey: "event")
        editor.setSelectedRange(NSRange(location: 8, length: 0))
        editor.insertNewline(nil)
        editor.insertText("New", replacementRange: editor.selectedRange())
        XCTAssertEqual(editor.string, "1. First\n2. New\n3. Second\nSeparate")
        let second = (editor.string as NSString).range(of: "Second")
        let font = editor.textStorage?.attribute(.font, at: second.location, effectiveRange: nil) as? NSFont
        XCTAssertTrue(font.map { NSFontManager.shared.traits(of: $0).contains(.boldFontMask) } ?? false)
    }

    func testBlurredPresentationShortensAutolinkLabelsWithoutChangingHTML() {
        var html = "<p><a href=\"https://example.com/path\">https://example.com/path</a></p>"
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { html }, set: { html = $0 }))
        let container = DescriptionEditorContainerView()
        let editor = container.textView
        coordinator.textView = editor
        coordinator.container = container
        editor.delegate = coordinator
        coordinator.load(html: html, resetKey: "event")
        coordinator.wasDescriptionFocused = true
        coordinator.syncPresentationOnFocusChange(isFocused: false, html: html, resetKey: "event")

        XCTAssertEqual(editor.string, "example.com")
        XCTAssertEqual(
            editor.textStorage?.attribute(.toolTip, at: 0, effectiveRange: nil) as? String,
            "https://example.com/path"
        )

        coordinator.syncPresentationOnFocusChange(isFocused: true, html: html, resetKey: "event")
        XCTAssertEqual(html, "<p><a href=\"https://example.com/path\">https://example.com/path</a></p>")
    }

    func testOpenDescriptionLinkUsesDocumentOrder() {
        let editor = DescriptionTextView()
        editor.textStorage?.setAttributedString(
            NSAttributedString(string: "ab", attributes: [
                .link: URL(string: "https://one.example/a")!,
            ])
        )
        editor.textStorage?.append(
            NSAttributedString(string: "cd", attributes: [
                .link: URL(string: "https://two.example/b")!,
            ])
        )
        var openedURLs: [URL] = []
        XCTAssertTrue(editor.openDescriptionLink(at: 1, openURL: { openedURLs.append($0) }))
        XCTAssertEqual(openedURLs.map(\.absoluteString), ["https://two.example/b"])
    }

    func testBookingManagementLinksSkipHintSlotAttachments() {
        let cancel = "https://compass.invalid/meet/cancel/reservation-1?token=secret"
        let reschedule = "https://compass.invalid/meet/reschedule/reservation-1?token=secret"
        let html =
            "<p><a href=\"\(cancel)\">Cancel</a> <a href=\"\(reschedule)\">Reschedule</a></p>"
        var bound = html
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { bound }, set: { bound = $0 }))
        let container = DescriptionEditorContainerView()
        let editor = container.textView
        coordinator.textView = editor
        coordinator.container = container
        coordinator.suppressLinkHintSlots = true
        coordinator.load(html: html, resetKey: "event")
        coordinator.syncLinkHintSlotsSilently()
        XCTAssertEqual(editor.string, "Cancel Reschedule")
        XCTAssertNotNil(BookingEventLinks.parse(bound))
    }

    func testPlainBoldDescriptionSaveReopenCycleDoesNotShowLinkHintOverlay() {
        var html = "<p><strong>Formatted note</strong></p>"
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { html }, set: { html = $0 }))
        let container = DescriptionEditorContainerView()
        let editor = container.textView
        coordinator.textView = editor
        coordinator.container = container
        editor.delegate = coordinator

        coordinator.load(html: html, resetKey: "demo-morning-standup")
        coordinator.syncPresentationOnFocusChange(isFocused: false, html: html, resetKey: "demo-morning-standup")
        XCTAssertFalse(
            coordinator.shouldShowLinkHintOverlay(isFocused: false, html: html, isEditable: true)
        )
        container.updateLinkHintOverlay(visible: false)
        container.layoutSubtreeIfNeeded()

        coordinator.load(html: html, resetKey: "demo-morning-standup")
        coordinator.syncPresentationOnFocusChange(isFocused: true, html: html, resetKey: "demo-morning-standup")
        XCTAssertEqual(editor.string, "Formatted note")
        coordinator.teardown()
        container.teardownLinkHintOverlay()
    }

    func testReadOnlyEditorRejectsFormatting() {
        let editor = DescriptionTextView()
        editor.textStorage?.setAttributedString(NSAttributedString(string: "Read only"))
        editor.setSelectedRange(NSRange(location: 0, length: 9))
        editor.isEditable = false
        editor.toggleFontTrait(.boldFontMask)
        editor.applyLink(URL(string: "https://example.com")!, to: editor.selectedRange())
        XCTAssertNil(editor.textStorage?.attribute(.link, at: 0, effectiveRange: nil))
        XCTAssertNil(editor.textStorage?.attribute(.font, at: 0, effectiveRange: nil))
    }
}
