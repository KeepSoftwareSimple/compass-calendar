import AppKit
import CompassKit

@MainActor
protocol EventCardViewDelegate: AnyObject {
    func eventCardViewDidClick(_ view: EventCardView, eventId: String)
    func eventCardView(_ view: EventCardView, didEditDraftTitle title: String, eventId: String)
}

final class EventCardView: NSView {
    private let titleField = NSTextField(labelWithString: "")
    private let accentLayer = CALayer()
    private let focusRingLayer = CALayer()
    private let focusAccessibilityAnchor = FocusedEventAccessibilityAnchorView()

    weak var cardDelegate: EventCardViewDelegate?
    private(set) var eventId: String = ""
    /// Card frame in `timedContentView` / all-day row coordinates. Used when AppKit
    /// bounds or XCTest accessibility frames are empty in CI but layout is valid.
    private(set) var layoutRectInParent: NSRect = .zero
    private var showsFocusAccessibilityAnchor = false
    private var showsInlineTitleEditor = false

    override var isFlipped: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.masksToBounds = true
        layer?.cornerRadius = 4

        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: 1)
        layer?.addSublayer(accentLayer)

        focusRingLayer.borderWidth = 2
        focusRingLayer.cornerRadius = 4
        focusRingLayer.backgroundColor = NSColor.clear.cgColor
        focusRingLayer.isHidden = true
        layer?.addSublayer(focusRingLayer)

        titleField.font = NSFont(name: "Rubik", size: 13) ?? .systemFont(ofSize: 13)
        titleField.lineBreakMode = .byTruncatingTail
        titleField.maximumNumberOfLines = 2
        titleField.isEditable = false
        titleField.isBordered = false
        titleField.drawsBackground = false
        titleField.delegate = self
        addSubview(titleField)
        titleField.setAccessibilityElement(false)
        titleField.refusesFirstResponder = true

        setAccessibilityElement(true)
        setAccessibilityRole(.button)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func apply(
        card: GridLayoutCardSnapshot,
        theme: NativeWebTheme,
        surfaceColor: NSColor,
        isFocused: Bool,
        isSidebarEditing: Bool = false
    ) {
        eventId = card.eventId
        layoutRectInParent = NSRect(
            x: card.frame.left,
            y: card.frame.top,
            width: card.frame.width,
            height: card.frame.height
        )
        frame = layoutRectInParent
        showsInlineTitleEditor = card.showsInlineTitleEditor
        titleField.stringValue = card.showsInlineTitleEditor && card.label == "Untitled event"
            ? ""
            : card.label
        titleField.placeholderString = card.showsInlineTitleEditor ? "Untitled event" : nil
        titleField.isEditable = card.showsInlineTitleEditor
        titleField.isSelectable = card.showsInlineTitleEditor
        titleField.textColor = textColor(for: theme)
        setAccessibilityLabel(card.label)
        setAccessibilityIdentifier(card.accessibilityIdentifier)
        syncFocusAccessibilityAnchor(isFocused: isFocused, label: card.label)

        let fill = EventCardColorParser.nsColor(hex: card.fillColorHex) ?? surfaceColor
        layer?.backgroundColor = fill.withAlphaComponent(card.isHiddenStrip ? 0.6 : 0.92).cgColor
        accentLayer.backgroundColor = (
            EventCardColorParser.nsColor(hex: card.fillColorHex) ?? accentColor(for: theme)
        ).cgColor

        let ringColor = EventCardColorParser.nsColor(hex: card.fillColorHex) ?? accentColor(for: theme)
        if isSidebarEditing {
            focusRingLayer.borderColor = theme.textColor.cgColor
        } else {
            focusRingLayer.borderColor = ringColor.cgColor
        }
        focusRingLayer.isHidden = !(isFocused || isSidebarEditing)
        needsLayout = true
        layoutSubtreeIfNeeded()
        syncAccessibilityFrame()
        if let window {
            NSAccessibility.post(element: self, notification: .layoutChanged)
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        layoutSubtreeIfNeeded()
        syncAccessibilityFrame()
    }

    override func layout() {
        super.layout()
        titleField.frame = bounds.insetBy(dx: 6, dy: 4)
        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: bounds.height)
        focusRingLayer.frame = bounds.insetBy(dx: -2, dy: -2)
        focusAccessibilityAnchor.frame = bounds
        syncAccessibilityFrame()
    }

    private func syncFocusAccessibilityAnchor(isFocused: Bool, label: String) {
        if isFocused {
            setAccessibilityElement(true)
            if focusAccessibilityAnchor.superview == nil {
                addSubview(focusAccessibilityAnchor)
            }
            focusAccessibilityAnchor.sync(label: label, frameInCard: bounds)
            if !showsFocusAccessibilityAnchor {
                showsFocusAccessibilityAnchor = true
                NSAccessibility.post(element: focusAccessibilityAnchor, notification: .created)
                if let window {
                    NSAccessibility.post(element: window, notification: .layoutChanged)
                }
            }
        } else {
            setAccessibilityElement(true)
            if showsFocusAccessibilityAnchor {
                showsFocusAccessibilityAnchor = false
                focusAccessibilityAnchor.removeFromSuperview()
            }
        }
    }

    func containsPointInWindow(_ locationInWindow: NSPoint) -> Bool {
        guard layoutRectInParent.width > 0.5, layoutRectInParent.height > 0.5,
            let superview
        else { return false }
        let rectInWindow = superview.convert(layoutRectInParent, to: nil)
        guard rectInWindow.width > 0.5, rectInWindow.height > 0.5 else { return false }
        return rectInWindow.insetBy(dx: -4, dy: -4).contains(locationInWindow)
    }

    func containsPointInDocument(_ locationInDocument: NSPoint, documentView: NSView) -> Bool {
        guard layoutRectInParent.width > 0.5, layoutRectInParent.height > 0.5,
            let superview
        else { return false }
        let rectInDocument = superview.convert(layoutRectInParent, to: documentView)
        guard rectInDocument.width > 0.5, rectInDocument.height > 0.5 else { return false }
        return rectInDocument.insetBy(dx: -6, dy: -6).contains(locationInDocument)
    }

    private func screenAccessibilityFrame() -> NSRect? {
        if let layoutFrame = screenFrameFromLayoutRect() {
            return layoutFrame
        }
        guard bounds.width > 0.5, bounds.height > 0.5, let window else { return nil }
        let screenFrame = window.convertToScreen(convert(bounds, to: nil))
        guard screenFrame.width > 0.5, screenFrame.height > 0.5 else { return nil }
        return screenFrame
    }

    private func screenFrameFromLayoutRect() -> NSRect? {
        guard layoutRectInParent.width > 0.5, layoutRectInParent.height > 0.5,
            let superview, let window
        else { return nil }
        let rectInWindow = superview.convert(layoutRectInParent, to: nil)
        guard rectInWindow.width > 0.5, rectInWindow.height > 0.5 else { return nil }
        let screenFrame = window.convertToScreen(rectInWindow)
        guard screenFrame.width > 0.5, screenFrame.height > 0.5 else { return nil }
        return screenFrame
    }

    private func syncAccessibilityFrame() {
        guard let screenFrame = screenAccessibilityFrame() else { return }
        setAccessibilityFrame(screenFrame)
    }

    override func accessibilityFrame() -> NSRect {
        if let screenFrame = screenAccessibilityFrame() {
            return screenFrame
        }
        return super.accessibilityFrame()
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard bounds.contains(point) else { return nil }
        // Route clicks to the card so pointer-down focuses the event (not the title label).
        return self
    }

    override func accessibilityPerformPress() -> Bool {
        cardDelegate?.eventCardViewDidClick(self, eventId: eventId)
        return true
    }

    override func mouseDown(with event: NSEvent) {
        cardDelegate?.eventCardViewDidClick(self, eventId: eventId)
    }
}

/// Separate accessibility element so XCUITest sees focus without mutating the card identifier.
private final class FocusedEventAccessibilityAnchorView: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func sync(label: String, frameInCard: NSRect) {
        frame = frameInCard
        setAccessibilityLabel(label)
        syncAccessibilityFrame()
    }

    override func layout() {
        super.layout()
        syncAccessibilityFrame()
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    override func accessibilityFrame() -> NSRect {
        guard bounds.width > 0.5, bounds.height > 0.5, let window, let superview else {
            return super.accessibilityFrame()
        }
        let rectInWindow = superview.convert(bounds, to: nil)
        return window.convertToScreen(rectInWindow)
    }

    private func syncAccessibilityFrame() {
        guard bounds.width > 0.5, bounds.height > 0.5, let window, let superview else { return }
        let rectInWindow = superview.convert(bounds, to: nil)
        setAccessibilityFrame(window.convertToScreen(rectInWindow))
    }
}

private func textColor(for theme: NativeWebTheme) -> NSColor {
    switch theme {
    case .lightBeach:
        ThemeTokens.lightBeach.text.nsColor
    case .darkAbyss:
        ThemeTokens.darkAbyss.text.nsColor
    }
}

extension EventCardView: NSTextFieldDelegate {
    func controlTextDidChange(_ obj: Notification) {
        guard showsInlineTitleEditor, obj.object as? NSTextField === titleField else { return }
        cardDelegate?.eventCardView(self, didEditDraftTitle: titleField.stringValue, eventId: eventId)
    }
}

private func accentColor(for theme: NativeWebTheme) -> NSColor {
    switch theme {
    case .lightBeach:
        ThemeTokens.lightBeach.accent.nsColor
    case .darkAbyss:
        ThemeTokens.darkAbyss.accent.nsColor
    }
}
