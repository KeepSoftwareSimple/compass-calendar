import AppKit
import CompassKit
import SwiftUI

struct DescriptionEditorView: NSViewRepresentable {
    @Environment(\.nativeWebTheme) private var theme
    @Binding var html: String
    var resetKey: String
    var isFocused: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(html: $html)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder

        let textView = DescriptionTextView()
        textView.isRichText = true
        textView.importsGraphics = false
        textView.isEditable = true
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

        scrollView.documentView = textView
        context.coordinator.textView = textView
        context.coordinator.applyTheme(theme)
        context.coordinator.load(html: html, resetKey: resetKey)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.applyTheme(theme)
        if context.coordinator.resetKey != resetKey {
            context.coordinator.load(html: html, resetKey: resetKey)
        }
        guard let textView = scrollView.documentView as? DescriptionTextView else { return }
        if isFocused, textView.window != nil {
            textView.window?.makeFirstResponder(textView)
        }
    }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        private var html: Binding<String>
        weak var textView: DescriptionTextView?
        var resetKey: String = ""
        private var sourceDocument = HTMLFragmentDocument(blocks: [])
        private var suppressDelegate = false

        init(html: Binding<String>) {
            self.html = html
        }

        func applyTheme(_ theme: NativeWebTheme) {
            guard let textView else { return }
            textView.typingAttributes = [
                .font: NSFont.systemFont(ofSize: 13),
                .foregroundColor: NSColor(theme.textColor),
            ]
            textView.textColor = NSColor(theme.textColor)
            textView.insertionPointColor = NSColor(theme.textColor)
            textView.linkTextAttributes = [
                .foregroundColor: NSColor(theme.accentColor),
                .underlineStyle: NSUnderlineStyle.single.rawValue,
            ]
        }

        func load(html: String, resetKey: String) {
            guard let textView else { return }
            self.resetKey = resetKey
            sourceDocument = HTMLFragmentDocument.parse(html)
            let attributed = HTMLFragmentAppKit.attributedString(
                from: sourceDocument,
                textColor: textView.textColor ?? .labelColor,
                linkColor: (textView.linkTextAttributes?[.foregroundColor] as? NSColor) ?? .linkColor
            )
            suppressDelegate = true
            textView.textStorage?.setAttributedString(attributed)
            suppressDelegate = false
        }

        func textDidChange(_ notification: Notification) {
            guard !suppressDelegate, let textView else { return }
            let edited = HTMLFragmentAppKit.document(
                from: textView.attributedString(),
                preservingVerbatimFrom: sourceDocument
            )
            html.wrappedValue = edited.serialize()
        }
    }
}

final class DescriptionTextView: NSTextView {
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
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

    override func mouseDown(with event: NSEvent) {
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
        guard index < string.count else { return nil }
        return attributedString().attribute(.link, at: index, effectiveRange: nil) as? URL
    }

    private func promptAndApplyLink() {
        let selected = selectedRange()
        guard selected.length > 0 else { return }
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
        textStorage?.addAttribute(.link, value: url, range: selected)
    }
}
