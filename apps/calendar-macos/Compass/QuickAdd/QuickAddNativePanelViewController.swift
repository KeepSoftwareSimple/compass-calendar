import AppKit
import CompassData
import CompassUI

@MainActor
final class QuickAddNativePanelViewController: NSViewController {
    private let model: NativeCalendarRootModel
    private let theme: NativeWebTheme
    private let onSubmit: () -> Void

    private let queryField = NSTextField()
    private let hintField = NSTextField(labelWithString: "")

    init(model: NativeCalendarRootModel, theme: NativeWebTheme, onSubmit: @escaping () -> Void) {
        self.model = model
        self.theme = theme
        self.onSubmit = onSubmit
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 472, height: 120))
        view.wantsLayer = true
        view.setAccessibilityIdentifier("compass-native-quick-add-panel")
        view.setAccessibilityElement(true)
        view.setAccessibilityRole(.group)

        queryField.isBordered = false
        queryField.isBezeled = false
        queryField.drawsBackground = true
        queryField.focusRingType = .none
        queryField.font = NSFont.systemFont(ofSize: 13)
        queryField.placeholderString = "Add an event, or type a time like 1130"
        queryField.setAccessibilityIdentifier("compass-native-quick-add-field")
        queryField.delegate = self
        queryField.translatesAutoresizingMaskIntoConstraints = false

        hintField.font = NSFont(name: "Rubik", size: 12) ?? NSFont.systemFont(ofSize: 12)
        hintField.textColor = NSColor(theme.textMutedColor)
        hintField.alignment = .center
        hintField.isHidden = true
        hintField.setAccessibilityIdentifier("compass-native-quick-add-time-hint")
        hintField.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(queryField)
        view.addSubview(hintField)
        applyTheme()

        NSLayoutConstraint.activate([
            queryField.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),
            queryField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            queryField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            queryField.heightAnchor.constraint(equalToConstant: 36),
            hintField.topAnchor.constraint(equalTo: queryField.bottomAnchor, constant: 8),
            hintField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            hintField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
        ])
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        queryField.stringValue = ""
        view.window?.makeFirstResponder(queryField)
    }

    func applyTheme() {
        view.layer?.backgroundColor = NSColor(theme.backgroundColor).cgColor
        queryField.backgroundColor = NSColor(theme.surfacePanelColor)
        queryField.textColor = NSColor(theme.textColor)
        hintField.textColor = NSColor(theme.textMutedColor)
    }

    private func syncHint() {
        let digits = model.draftStore.quickTimeDigits
        if digits.isEmpty {
            hintField.isHidden = true
            hintField.stringValue = ""
            return
        }
        hintField.isHidden = false
        hintField.stringValue =
            "New event at \(digits.padding(toLength: 4, withPad: "_", startingAt: 0)) · Esc"
    }
}

extension QuickAddNativePanelViewController: NSTextFieldDelegate {
    func controlTextDidChange(_ obj: Notification) {
        guard obj.object as? NSTextField === queryField else { return }
        model.syncQuickAddQuery(queryField.stringValue)
        syncHint()
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
