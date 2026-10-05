import AppKit
import SwiftUI

/// AppKit text field for quick add so XCUITest sees `compass-native-quick-add-field` in CI.
struct QuickAddFieldRepresentable: NSViewRepresentable {
    @Environment(\.nativeWebTheme) private var theme
    @Binding var text: String
    var shouldFocus: Bool
    var onSubmit: () -> Void
    var onTextChange: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, onSubmit: onSubmit, onTextChange: onTextChange)
    }

    func makeNSView(context: Context) -> NSTextField {
        let field = NSTextField()
        field.isBordered = false
        field.isBezeled = false
        field.drawsBackground = true
        field.focusRingType = .none
        field.font = NSFont.systemFont(ofSize: 13)
        field.placeholderString = "Add an event, or type a time like 1130"
        field.setAccessibilityIdentifier("compass-native-quick-add-field")
        field.delegate = context.coordinator
        context.coordinator.field = field
        return field
    }

    func updateNSView(_ field: NSTextField, context: Context) {
        if field.stringValue != text {
            field.stringValue = text
        }
        field.backgroundColor = NSColor(theme.surfacePanelColor)
        field.textColor = NSColor(theme.textColor)
        if shouldFocus, field.window != nil {
            field.window?.makeFirstResponder(field)
        }
    }

    @MainActor
    final class Coordinator: NSObject, NSTextFieldDelegate {
        weak var field: NSTextField?
        private var text: Binding<String>
        private let onSubmit: () -> Void
        private let onTextChange: (String) -> Void

        init(
            text: Binding<String>,
            onSubmit: @escaping () -> Void,
            onTextChange: @escaping (String) -> Void
        ) {
            self.text = text
            self.onSubmit = onSubmit
            self.onTextChange = onTextChange
        }

        func controlTextDidChange(_ obj: Notification) {
            guard let field = obj.object as? NSTextField else { return }
            let value = field.stringValue
            text.wrappedValue = value
            onTextChange(value)
        }

        func control(
            _ control: NSControl,
            textView: NSTextView,
            doCommandBy commandSelector: Selector
        ) -> Bool {
            if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                onSubmit()
                return true
            }
            return false
        }
    }
}
