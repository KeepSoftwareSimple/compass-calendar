import AppKit
import CompassKit

@MainActor
protocol EventCardViewDelegate: AnyObject {
    func eventCardViewDidClick(_ view: EventCardView, eventId: String)
}

final class EventCardView: NSView {
    private let titleField = NSTextField(labelWithString: "")
    private let accentLayer = CALayer()
    private let focusRingLayer = CALayer()

    weak var cardDelegate: EventCardViewDelegate?
    private(set) var eventId: String = ""

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
        addSubview(titleField)
        titleField.setAccessibilityElement(false)

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
        isFocused: Bool
    ) {
        eventId = card.eventId
        frame = NSRect(
            x: card.frame.left,
            y: card.frame.top,
            width: card.frame.width,
            height: card.frame.height
        )
        titleField.stringValue = card.label
        titleField.textColor = textColor(for: theme)
        setAccessibilityLabel(card.label)
        let identifier = isFocused
            ? "compass-grid-event-focused"
            : card.accessibilityIdentifier
        setAccessibilityIdentifier(identifier)

        let fill = EventCardColorParser.nsColor(hex: card.fillColorHex) ?? surfaceColor
        layer?.backgroundColor = fill.withAlphaComponent(card.isHiddenStrip ? 0.6 : 0.92).cgColor
        accentLayer.backgroundColor = (
            EventCardColorParser.nsColor(hex: card.fillColorHex) ?? accentColor(for: theme)
        ).cgColor

        let ringColor = EventCardColorParser.nsColor(hex: card.fillColorHex) ?? accentColor(for: theme)
        focusRingLayer.borderColor = ringColor.cgColor
        focusRingLayer.isHidden = !isFocused
        needsLayout = true
    }

    override func layout() {
        super.layout()
        titleField.frame = bounds.insetBy(dx: 6, dy: 4)
        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: bounds.height)
        focusRingLayer.frame = bounds.insetBy(dx: -2, dy: -2)
        if bounds.width > 1, bounds.height > 1, let window {
            setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
        }
    }

    override func accessibilityFrame() -> NSRect {
        guard bounds.width > 1, bounds.height > 1, let window else {
            return super.accessibilityFrame()
        }
        return window.convertToScreen(convert(bounds, to: nil))
    }

    override func mouseDown(with event: NSEvent) {
        cardDelegate?.eventCardViewDidClick(self, eventId: eventId)
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

private func accentColor(for theme: NativeWebTheme) -> NSColor {
    switch theme {
    case .lightBeach:
        ThemeTokens.lightBeach.accent.nsColor
    case .darkAbyss:
        ThemeTokens.darkAbyss.accent.nsColor
    }
}
