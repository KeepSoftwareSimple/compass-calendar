import AppKit
import CompassKit

final class EventCardView: NSView {
    private let titleField = NSTextField(labelWithString: "")
    private let accentLayer = CALayer()

    override var isFlipped: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.masksToBounds = true
        layer?.cornerRadius = 4

        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: 1)
        layer?.addSublayer(accentLayer)

        titleField.font = NSFont(name: "Rubik", size: 13) ?? .systemFont(ofSize: 13)
        titleField.lineBreakMode = .byTruncatingTail
        titleField.maximumNumberOfLines = 2
        titleField.translatesAutoresizingMaskIntoConstraints = false
        addSubview(titleField)

        NSLayoutConstraint.activate([
            titleField.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
            titleField.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            titleField.topAnchor.constraint(equalTo: topAnchor, constant: 4),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func apply(
        card: GridLayoutCardSnapshot,
        theme: NativeWebTheme,
        surfaceColor: NSColor
    ) {
        frame = NSRect(
            x: card.frame.left,
            y: card.frame.top,
            width: card.frame.width,
            height: card.frame.height
        )
        titleField.stringValue = card.label
        titleField.textColor = textColor(for: theme)
        setAccessibilityIdentifier(card.accessibilityIdentifier)

        let fill = EventCardColorParser.nsColor(hex: card.fillColorHex) ?? surfaceColor
        layer?.backgroundColor = fill.withAlphaComponent(card.isHiddenStrip ? 0.6 : 0.92).cgColor
        accentLayer.backgroundColor = (
            EventCardColorParser.nsColor(hex: card.fillColorHex) ?? accentColor(for: theme)
        ).cgColor
        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: bounds.height)
    }

    override func layout() {
        super.layout()
        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: bounds.height)
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
