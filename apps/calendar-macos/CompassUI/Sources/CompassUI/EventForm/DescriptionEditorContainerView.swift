import AppKit

final class DescriptionEditorContainerView: NSView {
    /// Web `DescriptionEditor` placeholder; drawn on the container so `DescriptionTextView` stays unchanged.
    static let descriptionPlaceholder = "Description"

    let textView = DescriptionTextView()
    private let linkHintOverlay = DescriptionLinkHintOverlayView()
    private let scrollView = NSScrollView()
    private let toolbar = NSStackView()
    private var buttons: [NSButton] = []
    private let placeholderLabel = NSTextField(labelWithString: descriptionPlaceholder)

    override var isFlipped: Bool { true }

    override init(frame: NSRect) {
        super.init(frame: frame)
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder
        scrollView.documentView = textView
        toolbar.frame = NSRect(x: 0, y: 0, width: 108, height: 24)
        toolbar.setAccessibilityElement(true)
        toolbar.setAccessibilityRole(.toolbar)
        toolbar.setAccessibilityLabel("Description formatting")
        toolbar.orientation = .horizontal
        toolbar.spacing = 4
        for (label, symbol, action) in [
            ("Bold", "bold", #selector(DescriptionTextView.toggleBold(_:))),
            ("Italic", "italic", #selector(DescriptionTextView.toggleItalic(_:))),
            ("Numbered list", "list.number", #selector(DescriptionTextView.toggleNumberedList(_:))),
            ("Bullet list", "list.bullet", #selector(DescriptionTextView.toggleBulletList(_:))),
        ] {
            let button = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: label)!,
                                  target: textView, action: action)
            button.setButtonType(.pushOnPushOff)
            button.bezelStyle = .inline
            button.isBordered = false
            button.setAccessibilityLabel(label)
            button.setAccessibilityIdentifier(label)
            button.toolTip = label
            button.widthAnchor.constraint(equalToConstant: 24).isActive = true
            button.heightAnchor.constraint(equalToConstant: 24).isActive = true
            toolbar.addArrangedSubview(button)
            buttons.append(button)
        }
        textView.onFormattingChange = { [weak self] in
            self?.updateControls()
            self?.updateDescriptionPlaceholder()
        }
        textView.setAccessibilityIdentifier("compass-event-form-description")
        textView.setAccessibilityLabel("Description")
        placeholderLabel.isEditable = false
        placeholderLabel.isBordered = false
        placeholderLabel.drawsBackground = false
        placeholderLabel.isEnabled = false
        placeholderLabel.font = NSFont.systemFont(ofSize: 13)
        placeholderLabel.alphaValue = 0.6
        placeholderLabel.isHidden = true
        textView.addSubview(placeholderLabel)
        linkHintOverlay.isHidden = true
        addSubview(toolbar)
        addSubview(scrollView)
        addSubview(linkHintOverlay)
    }

    var descriptionLinkDigitHintsVisible: Bool { linkHintOverlay.hintsVisible }

    func updateLinkHintOverlay(visible: Bool) {
        guard window != nil else {
            teardownLinkHintOverlay()
            return
        }
        linkHintOverlay.textView = textView
        linkHintOverlay.hintsVisible = visible
        linkHintOverlay.isHidden = !visible
        if visible {
            linkHintOverlay.needsLayout = true
        } else {
            linkHintOverlay.subviews.forEach { $0.removeFromSuperview() }
        }
    }

    func teardownLinkHintOverlay() {
        linkHintOverlay.textView = nil
        linkHintOverlay.hintsVisible = false
        linkHintOverlay.isHidden = true
        linkHintOverlay.subviews.forEach { $0.removeFromSuperview() }
    }

    func syncLinkHintSlots(reserved: Bool) {
        guard textView.window != nil else { return }
        textView.syncLinkHintSlots(reserved: reserved)
        if linkHintOverlay.hintsVisible {
            linkHintOverlay.needsLayout = true
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        toolbar.frame = NSRect(x: 0, y: 0, width: 108, height: 24)
        scrollView.frame = NSRect(x: 0, y: 28, width: bounds.width, height: max(0, bounds.height - 28))
        linkHintOverlay.frame = scrollView.frame
        layoutDescriptionPlaceholder()
    }

    func updateDescriptionPlaceholder() {
        let show = textView.isEditable
            && textView.string.isEmpty
            && !textView.hasMarkedText()
        placeholderLabel.isHidden = !show
        if show { layoutDescriptionPlaceholder() }
    }

    private func layoutDescriptionPlaceholder() {
        let inset = textView.textContainerInset
        let padding = textView.textContainer?.lineFragmentPadding ?? 0
        let size = placeholderLabel.sizeThatFits(
            NSSize(width: max(0, scrollView.bounds.width - inset.width * 2), height: .greatestFiniteMagnitude)
        )
        placeholderLabel.frame = NSRect(
            x: inset.width + padding,
            y: inset.height,
            width: size.width,
            height: max(size.height, 18)
        )
    }

    func updateControls(tint: NSColor? = nil) {
        let range = textView.selectedRange()
        let attributes = range.length > 0 && range.location < (textView.textStorage?.length ?? 0)
            ? textView.textStorage?.attributes(at: range.location, effectiveRange: nil) ?? [:]
            : textView.typingAttributes
        let font = attributes[.font] as? NSFont ?? NSFont.systemFont(ofSize: 13)
        let traits = NSFontManager.shared.traits(of: font)
        let list = attributes[HTMLFragmentAppKit.listKindKey] as? String
        let states = [traits.contains(.boldFontMask), traits.contains(.italicFontMask), list == "ordered", list == "unordered"]
        for (button, selected) in zip(buttons, states) {
            button.state = selected ? .on : .off
            button.isEnabled = textView.isEditable
            if let tint { button.contentTintColor = tint }
        }
        if let tint {
            placeholderLabel.textColor = tint
        } else if let textColor = textView.textColor {
            placeholderLabel.textColor = textColor
        }
        updateDescriptionPlaceholder()
    }
}
