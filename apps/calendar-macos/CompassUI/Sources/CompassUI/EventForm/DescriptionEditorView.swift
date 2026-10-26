import AppKit
import CompassKit
import SwiftUI

struct DescriptionEditorView: NSViewRepresentable {
    @Environment(\.nativeWebTheme) private var theme
    @Binding var html: String
    var resetKey: String
    var isFocused: Bool
    var isEditable = true
    /// Web `suppressLinkShortcutHints`: booking management links keep full inline layout.
    var suppressLinkHintSlots = false
    var onLinkCopied: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(html: $html)
    }

    func makeNSView(context: Context) -> DescriptionEditorContainerView {
        let container = DescriptionEditorContainerView()
        let textView = container.textView
        textView.onLinkCopied = onLinkCopied
        textView.isRichText = true
        textView.importsGraphics = false
        textView.isEditable = isEditable
        textView.allowsUndo = true
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 4, height: 6)
        textView.autoresizingMask = [.width]
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        textView.delegate = context.coordinator
        textView.setAccessibilityIdentifier("compass-event-form-description")
        textView.setAccessibilityLabel("Description")

        context.coordinator.container = container
        context.coordinator.textView = textView
        context.coordinator.applyTheme(theme)
        context.coordinator.load(html: html, resetKey: resetKey)
        return container
    }

    static func dismantleNSView(_ container: DescriptionEditorContainerView, coordinator: Coordinator) {
        coordinator.teardown()
        container.teardownLinkHintOverlay()
    }

    func updateNSView(_ container: DescriptionEditorContainerView, context: Context) {
        let textView = container.textView
        textView.onLinkCopied = onLinkCopied
        textView.isEditable = isEditable
        context.coordinator.applyTheme(theme)
        if context.coordinator.resetKey != resetKey {
            context.coordinator.load(html: html, resetKey: resetKey)
        }
        context.coordinator.suppressLinkHintSlots = suppressLinkHintSlots
        context.coordinator.applyInitialBlurPresentationIfNeeded(isFocused: isFocused, html: html)
        context.coordinator.syncPresentationOnFocusChange(isFocused: isFocused, html: html, resetKey: resetKey)
        container.updateLinkHintOverlay(
            visible: context.coordinator.shouldShowLinkHintOverlay(
                isFocused: isFocused,
                html: html,
                isEditable: isEditable
            )
        )
        if isFocused, textView.window != nil {
            textView.window?.makeFirstResponder(textView)
        }
    }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        private var html: Binding<String>
        weak var textView: DescriptionTextView?
        weak var container: DescriptionEditorContainerView?
        var resetKey: String = ""
        var suppressLinkHintSlots = false
        private var suppressDelegate = false

        init(html: Binding<String>) {
            self.html = html
        }

        func teardown() {
            textView?.delegate = nil
            textView = nil
            container = nil
        }

        func shouldShowLinkHintOverlay(isFocused: Bool, html: String, isEditable: Bool) -> Bool {
            guard isEditable, !isFocused, !suppressLinkHintSlots, container?.window != nil else { return false }
            if !DescriptionLinkPresentation.linkHrefs(in: html).isEmpty { return true }
            guard let textView else { return false }
            return linkHintSlotsReserved(for: textView)
        }

        func applyTheme(_ theme: NativeWebTheme) {
            guard let textView else { return }
            var attributes = textView.typingAttributes
            if attributes[.font] == nil { attributes[.font] = NSFont.systemFont(ofSize: 13) }
            attributes[.foregroundColor] = NSColor(theme.textColor)
            textView.typingAttributes = attributes
            textView.textColor = NSColor(theme.textColor)
            textView.insertionPointColor = NSColor(theme.textColor)
            container?.updateControls(tint: NSColor(theme.textMutedColor))
            textView.linkTextAttributes = [
                .foregroundColor: NSColor(theme.accentColor),
                .underlineStyle: NSUnderlineStyle.single.rawValue,
            ]
        }

        func load(html: String, resetKey: String) {
            guard let textView else { return }
            self.resetKey = resetKey
            presentationShowsHosts = false
            wasDescriptionFocused = false
            let sourceDocument = HTMLFragmentDocument.parse(html)
            let attributed = HTMLFragmentAppKit.attributedString(
                from: sourceDocument,
                textColor: textView.textColor ?? .labelColor,
                linkColor: (textView.linkTextAttributes?[.foregroundColor] as? NSColor) ?? .linkColor
            )
            suppressDelegate = true
            textView.textStorage?.setAttributedString(attributed)
            if shouldSyncLinkHintSlots(for: textView) {
                container?.syncLinkHintSlots(reserved: linkHintSlotsReserved(for: textView))
            }
            suppressDelegate = false
            container?.updateDescriptionPlaceholder()
        }

        func syncLinkHintSlotsSilently() {
            guard let textView, shouldSyncLinkHintSlots(for: textView) else { return }
            suppressDelegate = true
            container?.syncLinkHintSlots(reserved: linkHintSlotsReserved(for: textView))
            suppressDelegate = false
        }

        private func linkHintSlotsReserved(for textView: DescriptionTextView) -> Bool {
            guard textView.isEditable, !suppressLinkHintSlots else { return false }
            guard descriptionHasNonBookingLinks(in: textView) else { return false }
            return true
        }

        private func descriptionHasNonBookingLinks(in textView: DescriptionTextView) -> Bool {
            if BookingEventLinks.parse(html.wrappedValue) != nil { return false }
            if !DescriptionLinkPresentation.linkHrefs(in: html.wrappedValue).isEmpty {
                return true
            }
            guard let storage = textView.textStorage, storage.length > 0 else { return false }
            var hasLink = false
            storage.enumerateAttribute(.link, in: NSRange(location: 0, length: storage.length)) { value, _, stop in
                if value != nil {
                    hasLink = true
                    stop.pointee = true
                }
            }
            guard hasLink else { return false }
            let serialized = HTMLFragmentAppKit.document(from: textView.attributedString()).serialize()
            return BookingEventLinks.parse(serialized) == nil
        }

        private func shouldSyncLinkHintSlots(for textView: DescriptionTextView) -> Bool {
            linkHintSlotsReserved(for: textView) || textView.hasLinkHintSlotAttachments
        }

        private var presentationShowsHosts = false
        var wasDescriptionFocused = false

        func applyInitialBlurPresentationIfNeeded(isFocused: Bool, html: String) {
            guard !presentationShowsHosts, !isFocused, !wasDescriptionFocused else { return }
            guard !DescriptionLinkPresentation.linkHrefs(in: html).isEmpty else { return }
            guard textView != nil else { return }
            suppressDelegate = true
            textView?.applyHostLinkPresentation()
            if let textView {
                container?.syncLinkHintSlots(reserved: linkHintSlotsReserved(for: textView))
            }
            suppressDelegate = false
            presentationShowsHosts = true
        }

        func syncPresentationOnFocusChange(isFocused: Bool, html: String, resetKey: String) {
            defer { wasDescriptionFocused = isFocused }
            guard isFocused != wasDescriptionFocused else { return }
            guard !DescriptionLinkPresentation.linkHrefs(in: html).isEmpty else {
                presentationShowsHosts = false
                return
            }
            if isFocused, presentationShowsHosts {
                load(html: html, resetKey: resetKey)
                presentationShowsHosts = false
            } else if !isFocused {
                guard textView != nil else { return }
                suppressDelegate = true
                textView?.applyHostLinkPresentation()
                if let textView {
                    container?.syncLinkHintSlots(reserved: linkHintSlotsReserved(for: textView))
                }
                suppressDelegate = false
                presentationShowsHosts = true
            }
        }

        func textDidChange(_ notification: Notification) {
            guard !suppressDelegate, let textView else { return }
            let edited = HTMLFragmentAppKit.document(from: textView.attributedString())
            html.wrappedValue = edited.serialize()
            presentationShowsHosts = false
            syncLinkHintSlotsSilently()
            container?.updateControls()
            container?.updateDescriptionPlaceholder()
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            container?.updateControls()
        }
    }
}

public final class DescriptionTextView: NSTextView {
    var onFormattingChange: (() -> Void)?

    var onLinkCopied: (() -> Void)?

    public override func accessibilityValue() -> String? {
        guard let value = super.accessibilityValue() else { return nil }
        return value.replacingOccurrences(of: "\u{FFFC}", with: "")
    }

    @objc func copyDescriptionLink(_ sender: Any?) {
        _ = copyDescriptionLink(to: .general)
    }

    @objc public func openDescriptionLinkAtCaret(_ sender: Any?) {
        _ = openDescriptionLinkAtCaret()
    }

    @objc public func openDescriptionLinkDigit(_ sender: Any?) {
        guard let index = (sender as? NSNumber)?.intValue else { return }
        _ = openDescriptionLink(at: index)
    }

    @discardableResult
    public func openDescriptionLinkAtCaret() -> Bool {
        guard let href = descriptionLinkToCopy(), let url = URL(string: href) else { return false }
        NSWorkspace.shared.open(url)
        return true
    }

    @discardableResult
    func openDescriptionLink(at index: Int, openURL: (URL) -> Void = { NSWorkspace.shared.open($0) }) -> Bool {
        guard index >= 0, index < orderedLinkHrefs().count,
              let url = URL(string: orderedLinkHrefs()[index])
        else { return false }
        openURL(url)
        return true
    }

    func orderedLinkHrefs() -> [String] {
        guard let storage = textStorage, storage.length > 0 else { return [] }
        var hrefs: [String] = []
        storage.enumerateAttribute(.link, in: NSRange(location: 0, length: storage.length)) { value, _, _ in
            let href = (value as? URL)?.absoluteString ?? value as? String
            if let href, !href.isEmpty { hrefs.append(href) }
        }
        return hrefs
    }

    func applyHostLinkPresentation() {
        guard let storage = textStorage, storage.length > 0 else { return }
        let fullString = storage.string as NSString
        var replacements: [(range: NSRange, href: String, host: String)] = []
        storage.enumerateAttribute(.link, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
            let href = (value as? URL)?.absoluteString ?? value as? String ?? ""
            guard !href.isEmpty else { return }
            let visible = fullString.substring(with: range)
            guard DescriptionLinkPresentation.shouldShortenVisibleLabel(text: visible, href: href) else { return }
            let host = DescriptionLinkPresentation.displayHost(for: href)
            guard visible != host else { return }
            replacements.append((range, href, host))
        }
        guard !replacements.isEmpty else { return }
        storage.beginEditing()
        for entry in replacements.sorted(by: { $0.range.location > $1.range.location }) {
            storage.replaceCharacters(in: entry.range, with: entry.host)
            let newRange = NSRange(location: entry.range.location, length: (entry.host as NSString).length)
            storage.addAttribute(.link, value: URL(string: entry.href) ?? entry.href, range: newRange)
            storage.addAttribute(.toolTip, value: entry.href, range: newRange)
        }
        storage.endEditing()
    }

    var hasLinkHintSlotAttachments: Bool {
        guard let storage = textStorage, storage.length > 0 else { return false }
        var found = false
        storage.enumerateAttribute(.attachment, in: NSRange(location: 0, length: storage.length)) { value, _, stop in
            if value is DescriptionLinkHintSlotAttachment {
                found = true
                stop.pointee = true
            }
        }
        return found
    }

    func syncLinkHintSlots(reserved: Bool) {
        guard let storage = textStorage else { return }
        storage.beginEditing()
        defer { storage.endEditing() }

        var hintSlotRanges: [NSRange] = []
        if storage.length > 0 {
            storage.enumerateAttribute(.attachment, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
                if value is DescriptionLinkHintSlotAttachment {
                    hintSlotRanges.append(range)
                }
            }
        }
        for range in hintSlotRanges.sorted(by: { $0.location > $1.location }) {
            storage.deleteCharacters(in: range)
        }
        guard reserved, storage.length > 0 else { return }

        var linkRanges: [NSRange] = []
        storage.enumerateAttribute(.link, in: NSRange(location: 0, length: storage.length)) { _, range, _ in
            linkRanges.append(range)
        }
        for range in linkRanges.sorted(by: { $0.location > $1.location }) {
            let insertAt = range.location + range.length
            let attachment = DescriptionLinkHintSlotAttachment()
            let slot = NSMutableAttributedString(attachment: attachment)
            slot.addAttribute(HTMLFragmentAppKit.linkHintSlotKey, value: true, range: NSRange(location: 0, length: 1))
            storage.insert(slot, at: insertAt)
        }
    }

    static func findInKeyWindow() -> DescriptionTextView? {
        find(in: NSApp.keyWindow?.contentView)
    }

    private static func find(in root: NSView?) -> DescriptionTextView? {
        guard let root else { return nil }
        if let editor = root as? DescriptionTextView,
           editor.accessibilityIdentifier() == "compass-event-form-description"
        {
            return editor
        }
        for subview in root.subviews {
            if let found = find(in: subview) { return found }
        }
        return nil
    }

    @discardableResult
    func copyDescriptionLink(to pasteboard: NSPasteboard) -> Bool {
        guard let href = descriptionLinkToCopy() else { return false }
        pasteboard.clearContents()
        let copied = pasteboard.setString(href, forType: .string)
        if copied { onLinkCopied?() }
        return copied
    }

    private func descriptionLinkToCopy() -> String? {
        guard let storage = textStorage, storage.length > 0 else { return nil }
        func href(_ value: Any?) -> String? {
            let value = (value as? URL)?.absoluteString ?? value as? String
            return value?.isEmpty == false ? value : nil
        }
        let caret = selectedRange().location
        if caret < storage.length, let link = href(storage.attribute(.link, at: caret, effectiveRange: nil)) {
            return link
        }
        var firstLink: String?
        storage.enumerateAttribute(.link, in: NSRange(location: 0, length: storage.length)) { value, _, stop in
            if let link = href(value) {
                firstLink = link
                stop.pointee = true
            }
        }
        return firstLink
    }

    @objc func toggleBold(_ sender: Any?) { toggleFontTrait(.boldFontMask) }
    @objc func toggleItalic(_ sender: Any?) { toggleFontTrait(.italicFontMask) }
    @objc func toggleNumberedList(_ sender: Any?) { toggleList(ordered: true) }
    @objc func toggleBulletList(_ sender: Any?) { toggleList(ordered: false) }

    public override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if event.modifierFlags.contains(.command) {
            switch event.charactersIgnoringModifiers?.lowercased() {
            case "b":
                toggleFontTrait(.boldFontMask)
                return true
            case "i":
                toggleFontTrait(.italicFontMask)
                return true
            case "k":
                promptAndApplyLink()
                return true
            default:
                break
            }
        }
        return super.performKeyEquivalent(with: event)
    }

    public override func mouseDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command),
            let link = link(at: event.locationInWindow)
        {
            NSWorkspace.shared.open(link)
            return
        }
        super.mouseDown(with: event)
    }

    private func link(at locationInWindow: NSPoint) -> URL? {
        guard let layoutManager, let textContainer else { return nil }
        let point = convert(locationInWindow, from: nil)
        let index = layoutManager.characterIndex(
            for: point,
            in: textContainer,
            fractionOfDistanceBetweenInsertionPoints: nil
        )
        guard index < (string as NSString).length else { return nil }
        return attributedString().attribute(.link, at: index, effectiveRange: nil) as? URL
    }

    func toggleFontTrait(_ trait: NSFontTraitMask) {
        guard isEditable else { return }
        window?.makeFirstResponder(self)
        let range = selectedRange()
        if range.length == 0 {
            let font = typingAttributes[.font] as? NSFont ?? NSFont.systemFont(ofSize: 13)
            let hasTrait = NSFontManager.shared.traits(of: font).contains(trait)
            typingAttributes[.font] = hasTrait
                ? NSFontManager.shared.convert(font, toNotHaveTrait: trait)
                : NSFontManager.shared.convert(font, toHaveTrait: trait)
            onFormattingChange?()
            return
        }
        guard shouldChangeText(in: range, replacementString: nil) else { return }
        textStorage?.enumerateAttribute(.font, in: range) { value, subRange, _ in
            let font = (value as? NSFont) ?? NSFont.systemFont(ofSize: 13)
            let hasTrait = NSFontManager.shared.traits(of: font).contains(trait)
            let updated = hasTrait
                ? NSFontManager.shared.convert(font, toNotHaveTrait: trait)
                : NSFontManager.shared.convert(font, toHaveTrait: trait)
            textStorage?.addAttribute(.font, value: updated, range: subRange)
        }
        didChangeText()
        onFormattingChange?()
    }

    public override func insertNewline(_ sender: Any?) {
        guard isEditable, let storage = textStorage else { return }
        let range = paragraphRange(containing: NSRange(location: selectedRange().location, length: 0))
        guard range.length > 0,
              let kind = storage.attribute(HTMLFragmentAppKit.listKindKey, at: range.location, effectiveRange: nil) as? String
        else { super.insertNewline(sender); return }
        let line = (string as NSString).substring(with: range)
        let prefixLength = HTMLFragmentAppKit.listPrefixLength(line, kind: kind)
        if (line as NSString).substring(from: prefixLength).trimmingCharacters(in: .whitespaces).isEmpty {
            guard shouldChangeText(in: range, replacementString: "") else { return }
            storage.replaceCharacters(in: range, with: "")
            typingAttributes.removeValue(forKey: HTMLFragmentAppKit.listKindKey)
            setSelectedRange(NSRange(location: range.location, length: 0))
            didChangeText()
            onFormattingChange?()
            return
        }
        let attributes = typingAttributes
        super.insertNewline(sender)
        typingAttributes = attributes
        typingAttributes[HTMLFragmentAppKit.listKindKey] = kind
        let number = Int(line.components(separatedBy: ".").first ?? "") ?? 0
        insertText(kind == "unordered" ? "• " : "\(number + 1). ", replacementRange: selectedRange())
        if kind == "ordered" {
            renumberFollowingItems(after: paragraphRange(containing: selectedRange()), startingAt: number + 2)
            didChangeText()
        }
    }

    private func renumberFollowingItems(after paragraph: NSRange, startingAt firstNumber: Int) {
        guard let storage = textStorage else { return }
        var offset = NSMaxRange(paragraph) + 1
        var number = firstNumber
        while offset < storage.length {
            let range = paragraphRange(containing: NSRange(location: offset, length: 0))
            guard range.length > 0,
                  storage.attribute(HTMLFragmentAppKit.listKindKey, at: offset, effectiveRange: nil) as? String == "ordered"
            else { break }
            let line = (storage.string as NSString).substring(with: range)
            let prefixLength = HTMLFragmentAppKit.listPrefixLength(line, kind: "ordered")
            let prefix = NSAttributedString(string: "\(number). ", attributes: storage.attributes(at: offset, effectiveRange: nil))
            storage.replaceCharacters(in: NSRange(location: offset, length: prefixLength), with: prefix)
            offset = NSMaxRange(range) + prefix.length - prefixLength + 1
            number += 1
        }
    }

    private func paragraphRange(containing selection: NSRange) -> NSRange {
        let text = string as NSString
        let before = text.range(of: "\n", options: .backwards, range: NSRange(location: 0, length: selection.location))
        let start = before.location == NSNotFound ? 0 : NSMaxRange(before)
        let lastSelected = max(selection.location, NSMaxRange(selection) - 1)
        let after = text.range(of: "\n", range: NSRange(location: lastSelected, length: text.length - lastSelected))
        return NSRange(location: start, length: (after.location == NSNotFound ? text.length : after.location) - start)
    }

    func toggleList(ordered: Bool) {
        guard isEditable, let storage = textStorage else { return }
        var selection = selectedRange()
        var range = paragraphRange(containing: selection)
        let lineSeparator = "\u{2028}"
        let rangeText = (storage.string as NSString).substring(with: range)
        if rangeText.contains(lineSeparator) {
            let preservedSelection = selection
            storage.beginEditing()
            var searchStart = range.location
            let rangeEnd = NSMaxRange(range)
            while searchStart < rangeEnd {
                let found = (storage.string as NSString).range(
                    of: lineSeparator,
                    range: NSRange(location: searchStart, length: rangeEnd - searchStart)
                )
                if found.location == NSNotFound { break }
                guard shouldChangeText(in: found, replacementString: "\n") else {
                    storage.endEditing()
                    return
                }
                storage.replaceCharacters(in: found, with: "\n")
                searchStart = found.location + 1
            }
            storage.endEditing()
            setSelectedRange(preservedSelection)
            selection = preservedSelection
            range = paragraphRange(containing: selection)
        }
        let start = range.location
        guard shouldChangeText(in: range, replacementString: nil) else { return }
        let source = storage.attributedSubstring(from: range)
        let kind = ordered ? "ordered" : "unordered"
        let lines = source.string.components(separatedBy: "\n")
        var offset = 0
        let items = lines.map { line -> (NSMutableAttributedString, String?, Int) in
            let length = (line as NSString).length
            let currentKind = length > 0 ? source.attribute(HTMLFragmentAppKit.listKindKey, at: offset, effectiveRange: nil) as? String : nil
            let prefix = HTMLFragmentAppKit.listPrefixLength(line, kind: currentKind)
            let content = NSMutableAttributedString(attributedString: source.attributedSubstring(
                from: NSRange(location: offset + prefix, length: length - prefix)))
            content.removeAttribute(HTMLFragmentAppKit.listKindKey, range: NSRange(location: 0, length: content.length))
            offset += length + 1
            return (content, currentKind, prefix)
        }
        let remove = items.allSatisfy { $0.1 == kind }
        let replacement = NSMutableAttributedString()
        var firstPrefixLength = 0
        for (index, item) in items.enumerated() {
            if index > 0 { replacement.append(NSAttributedString(string: "\n")) }
            let itemStart = replacement.length
            if !remove {
                let prefix = ordered ? "\(index + 1). " : "• "
                if index == 0 { firstPrefixLength = (prefix as NSString).length }
                replacement.append(NSAttributedString(string: prefix, attributes: typingAttributes))
            }
            replacement.append(item.0)
            if !remove {
                replacement.addAttribute(HTMLFragmentAppKit.listKindKey, value: kind,
                    range: NSRange(location: itemStart, length: replacement.length - itemStart))
            }
        }
        storage.replaceCharacters(in: range, with: replacement)
        let newLocation = min(start + replacement.length, max(start, selection.location + firstPrefixLength - (items.first?.2 ?? 0)))
        let newEnd = min(start + replacement.length, max(newLocation, NSMaxRange(selection) + replacement.length - range.length))
        setSelectedRange(NSRange(location: newLocation, length: selection.length == 0 ? 0 : newEnd - newLocation))
        if remove { typingAttributes.removeValue(forKey: HTMLFragmentAppKit.listKindKey) }
        else { typingAttributes[HTMLFragmentAppKit.listKindKey] = kind }
        didChangeText()
        onFormattingChange?()
        window?.makeFirstResponder(self)
    }

    private func promptAndApplyLink() {
        let selected = selectedRange()
        guard isEditable, selected.length > 0 else { return }
        let alert = NSAlert()
        alert.messageText = "Add Link"
        alert.informativeText = "Enter a URL for the selected text."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.placeholderString = "https://"
        alert.accessoryView = field
        alert.addButton(withTitle: "Apply")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let href = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard href.hasPrefix("http://") || href.hasPrefix("https://"), let url = URL(string: href) else {
            return
        }
        applyLink(url, to: selected)
    }

    func applyLink(_ url: URL, to range: NSRange) {
        guard isEditable, range.length > 0,
              shouldChangeText(in: range, replacementString: nil) else { return }
        textStorage?.addAttribute(.link, value: url, range: range)
        didChangeText()
        onFormattingChange?()
    }
}
