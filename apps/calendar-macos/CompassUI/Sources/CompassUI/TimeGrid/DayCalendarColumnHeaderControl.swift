import AppKit
import CompassKit

@MainActor
final class DayCalendarColumnHeaderControl: NSControl {
    var calendarId: String = ""
    var onFocus: ((String) -> Void)?

    private let colorDot = NSView()
    private let titleField = NSTextField(labelWithString: "")
    private let chipLabel = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        focusRingType = .exterior
        titleField.lineBreakMode = .byTruncatingTail
        titleField.font = NSFont(name: "Rubik", size: 12) ?? .systemFont(ofSize: 12)
        titleField.alignment = .center
        titleField.cell?.truncatesLastVisibleLine = true
        chipLabel.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
        chipLabel.alignment = .center
        chipLabel.isHidden = true
        chipLabel.wantsLayer = true
        chipLabel.layer?.cornerRadius = 4
        addSubview(colorDot)
        addSubview(titleField)
        addSubview(chipLabel)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func apply(
        calendar: CompassCalendar,
        jumpDigit: String?,
        hintsVisible: Bool,
        isFocused: Bool,
        palette: (text: NSColor, accent: NSColor, surface: NSColor)
    ) {
        calendarId = calendar.id
        titleField.stringValue = calendar.name
        toolTip = calendar.name
        setAccessibilityLabel("Focus \(calendar.name) column")
        setAccessibilityIdentifier("compass-day-column-header-\(calendar.id)")

        if let color = NSColor(hex: calendar.backgroundColor) {
            colorDot.layer?.backgroundColor = color.cgColor
        }
        colorDot.layer?.cornerRadius = 4

        titleField.textColor = palette.text
        chipLabel.stringValue = jumpDigit ?? ""
        chipLabel.isHidden = !hintsVisible || jumpDigit == nil
        chipLabel.textColor = palette.text
        chipLabel.layer?.backgroundColor = palette.surface.withAlphaComponent(0.9).cgColor

        layer?.backgroundColor =
            isFocused ? palette.accent.withAlphaComponent(0.12).cgColor : NSColor.clear.cgColor
    }

    override func layout() {
        super.layout()
        let dotSize: CGFloat = 8
        let chipSize = CGSize(width: 20, height: 18)
        let chipPadding: CGFloat = chipLabel.isHidden ? 0 : chipSize.width + 4
        let contentWidth = bounds.width - dotSize - 8 - chipPadding
        colorDot.frame = NSRect(x: 4, y: (bounds.height - dotSize) / 2, width: dotSize, height: dotSize)
        titleField.frame = NSRect(
            x: colorDot.frame.maxX + 4,
            y: 0,
            width: max(0, contentWidth),
            height: bounds.height
        )
        if !chipLabel.isHidden {
            chipLabel.frame = NSRect(
                x: bounds.width - chipSize.width - 4,
                y: (bounds.height - chipSize.height) / 2,
                width: chipSize.width,
                height: chipSize.height
            )
        }
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        onFocus?(calendarId)
    }

    override var acceptsFirstResponder: Bool { true }

    override func becomeFirstResponder() -> Bool {
        onFocus?(calendarId)
        return super.becomeFirstResponder()
    }

    override func drawFocusRingMask() {
        bounds.insetBy(dx: 1, dy: 1).fill()
    }

    override var focusRingMaskBounds: NSRect { bounds.insetBy(dx: 1, dy: 1) }
}

private extension NSColor {
    convenience init?(hex: String) {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") {
            cleaned.removeFirst()
        }
        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else { return nil }
        let r = CGFloat((value >> 16) & 0xFF) / 255
        let g = CGFloat((value >> 8) & 0xFF) / 255
        let b = CGFloat(value & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: 1)
    }
}
