import AppKit
import CompassKit

@MainActor
protocol EventCardViewDelegate: AnyObject {
    func eventCardViewDidClick(_ view: EventCardView, eventId: String)
    func eventCardView(_ view: EventCardView, didEditDraftTitle title: String, eventId: String)
}

final class EventCardView: NSView {
    private let textContainer = EventCardTextContainerView()
    private var visibleContentRect: NSRect?
    private let titleField = NSTextField(labelWithString: "")
    private let timeField = NSTextField(labelWithString: "")
    private let accentLayer = CALayer()
    private let deckEdgeLayer = CAShapeLayer()
    private var shadowSpreadInset: CGFloat = 0
    private let focusRingLayer = CALayer()
    /// Web `outline-dashed outline-1 outline-text-muted/50` for unsettled cards.
    private let unsettledOutlineLayer = CAShapeLayer()
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
        layer?.cornerRadius = 4

        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: 1)
        accentLayer.cornerRadius = 4
        accentLayer.maskedCorners = [.layerMinXMinYCorner, .layerMinXMaxYCorner]
        layer?.addSublayer(accentLayer)
        deckEdgeLayer.name = "deck-separation-edge"
        deckEdgeLayer.fillColor = nil
        deckEdgeLayer.lineWidth = 0.75
        layer?.addSublayer(deckEdgeLayer)

        unsettledOutlineLayer.fillColor = nil
        unsettledOutlineLayer.lineWidth = 1
        unsettledOutlineLayer.lineDashPattern = [3, 2]
        unsettledOutlineLayer.isHidden = true
        layer?.addSublayer(unsettledOutlineLayer)

        focusRingLayer.borderWidth = 2
        focusRingLayer.cornerRadius = 6
        focusRingLayer.backgroundColor = NSColor.clear.cgColor
        focusRingLayer.isHidden = true
        layer?.addSublayer(focusRingLayer)

        textContainer.wantsLayer = true
        textContainer.clipsToBounds = true
        textContainer.layer?.masksToBounds = true
        addSubview(textContainer)
        titleField.font = CompassFont.nsFont(size: 13)
        titleField.lineBreakMode = .byTruncatingTail
        titleField.maximumNumberOfLines = 2
        titleField.isEditable = false
        titleField.isBordered = false
        titleField.drawsBackground = false
        titleField.delegate = self
        textContainer.addSubview(titleField)
        titleField.setAccessibilityElement(false)
        titleField.refusesFirstResponder = true
        timeField.font = CompassFont.nsFont(size: 11)
        timeField.lineBreakMode = .byTruncatingTail
        timeField.maximumNumberOfLines = 1
        timeField.alphaValue = 0.82
        timeField.isHidden = true
        timeField.setAccessibilityElement(false)
        textContainer.addSubview(timeField)

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
        isFocused: Bool,
        isSidebarEditing: Bool = false,
        isUnsettled: Bool = false,
        isPast: Bool = false,
        timeLabel: String? = nil
    ) {
        eventId = card.eventId
        layoutRectInParent = NSRect(
            x: card.frame.left,
            y: card.frame.top,
            width: card.frame.width,
            height: card.frame.height
        )
        visibleContentRect = nil
        frame = layoutRectInParent
        showsInlineTitleEditor = card.showsInlineTitleEditor
        // Web prints the raw title, so an untitled draft shows only its time;
        // the accessibility label still says "Untitled event".
        titleField.stringValue = (card.showsInlineTitleEditor || card.isDraft) && card.label == "Untitled event"
            ? ""
            : card.label
        titleField.placeholderString = card.showsInlineTitleEditor ? "Untitled event" : nil
        titleField.isEditable = card.showsInlineTitleEditor
        titleField.isSelectable = card.showsInlineTitleEditor
        setAccessibilityLabel(card.label)
        setAccessibilityHelp(timeLabel)
        timeField.stringValue = timeLabel ?? ""
        timeField.isHidden = timeLabel == nil || card.kind != .timed || card.isHiddenStrip
            || card.frame.height < 36 || card.frame.width < 90
        setAccessibilityIdentifier(card.accessibilityIdentifier)
        setAccessibilityValue(card.isHiddenStrip ? "hidden" : "visible")
        syncFocusAccessibilityAnchor(isFocused: isFocused, label: card.label)

        let baseFill = EventCardColorParser.nsColor(hex: card.fillColorHex) ?? defaultEventFill(for: theme)
        let fill = isPast && !card.isDraft ? EventCardPastFill.color(baseFill) : baseFill
        layer?.backgroundColor = fill.cgColor
        layer?.opacity = card.isHiddenStrip ? 0.6 : 1
        deckEdgeLayer.isHidden = !card.isDeck
        deckEdgeLayer.strokeColor = NSColor(theme.backgroundColor).cgColor
        shadowSpreadInset = card.isDeck ? (isFocused ? 3 : 2) : 0
        if card.isDeck {
            layer?.shadowColor = NSColor.black.cgColor
            layer?.shadowOffset = CGSize(width: 0, height: isFocused ? -6 : -3)
            layer?.shadowRadius = isFocused ? 7 : 3
            layer?.shadowOpacity = isFocused ? 0.55 : 0.4
        } else if card.isDraft {
            layer?.shadowColor = NSColor.black.withAlphaComponent(0.28).cgColor
            layer?.shadowOffset = CGSize(width: 0, height: -1)
            layer?.shadowRadius = 2
            layer?.shadowOpacity = 1
        } else {
            layer?.shadowOpacity = 0
        }
        titleField.textColor = contrastText(on: fill, theme: theme)
        timeField.textColor = titleField.textColor
        accentLayer.backgroundColor = EventCardColorParser.nsColor(hex: card.calendarAccentColorHex)?.cgColor
        accentLayer.isHidden = card.calendarAccentColorHex == nil

        if isSidebarEditing {
            focusRingLayer.borderColor = theme.textColor.cgColor
        } else {
            focusRingLayer.borderColor = focusRingColor(fill: EventCardColorParser.nsColor(hex: card.focusColorHex) ?? fill, theme: theme).cgColor
        }
        focusRingLayer.isHidden = !(isFocused || isSidebarEditing)
        unsettledOutlineLayer.strokeColor = unsettledOutlineColor(theme).cgColor
        unsettledOutlineLayer.isHidden = !isUnsettled || card.isDraft
        // The ring sits outside the card, like the web's 2px outline with a
        // 2px offset, so the card must not clip. AppKit turns clipping back on
        // after init, so this runs on every apply. The accent strip rounds its
        // own corners.
        clipsToBounds = false
        layer?.masksToBounds = false
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

    func updateVisibleContentRect(_ rect: NSRect) {
        guard visibleContentRect != rect else { return }
        visibleContentRect = rect
        needsLayout = true
        layoutSubtreeIfNeeded()
    }

    override func layout() {
        super.layout()
        // Short cards (all-day rows are 20pt) trim the vertical inset so the
        // title line is not clipped.
        let titleLineHeight = 16.0
        let verticalInset = max(0, min(4, (bounds.height - titleLineHeight) / 2))
        textContainer.frame = bounds
        let visibleBounds = visibleContentRect.map { bounds.intersection($0) } ?? bounds
        let labelBounds = visibleBounds.isEmpty ? bounds : NSRect(
            x: bounds.minX, y: visibleBounds.minY, width: bounds.width, height: visibleBounds.height)
        let titleBounds = labelBounds.insetBy(dx: 6, dy: verticalInset)
        let timeHeight: CGFloat = timeField.isHidden ? 0 : 13
        let titleFont = CompassFont.nsFont(size: bounds.height <= 15 ? 10 : 13)
        titleField.font = titleFont
        let lineHeight: CGFloat = bounds.height <= 15 ? 11 : 16
        let availableHeight = max(lineHeight, titleBounds.height - timeHeight)
        titleField.maximumNumberOfLines = max(1, Int((availableHeight / lineHeight).rounded(.down)))
        let measured = (titleField.stringValue as NSString).boundingRect(
            with: NSSize(width: max(1, titleBounds.width), height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin], attributes: [.font: titleFont]).height
        let titleHeight = min(availableHeight, max(lineHeight, ceil(measured / lineHeight) * lineHeight))
        titleField.frame = NSRect(x: titleBounds.minX, y: titleBounds.minY,
            width: titleBounds.width, height: titleHeight)
        timeField.frame = NSRect(x: titleBounds.minX, y: titleField.frame.maxY,
            width: titleBounds.width, height: timeHeight)
        accentLayer.frame = CGRect(x: 0, y: 0, width: 3, height: bounds.height)
        layer?.shadowPath = CGPath(roundedRect: bounds.insetBy(dx: shadowSpreadInset, dy: shadowSpreadInset),
            cornerWidth: max(0, 4 - shadowSpreadInset), cornerHeight: max(0, 4 - shadowSpreadInset), transform: nil)
        deckEdgeLayer.frame = bounds
        deckEdgeLayer.path = CGPath(roundedRect: bounds.insetBy(dx: -0.375, dy: -0.375),
            cornerWidth: 4.375, cornerHeight: 4.375, transform: nil)
        focusRingLayer.frame = bounds.insetBy(dx: -4, dy: -4)
        // A CSS outline sits just outside the border box.
        let outlineRect = bounds.insetBy(dx: -0.5, dy: -0.5)
        unsettledOutlineLayer.frame = bounds
        unsettledOutlineLayer.path = CGPath(
            roundedRect: outlineRect, cornerWidth: 4.5, cornerHeight: 4.5, transform: nil)
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
                NSAccessibility.post(
                    element: focusAccessibilityAnchor,
                    notification: .uiElementDestroyed)
                focusAccessibilityAnchor.removeFromSuperview()
            }
        }
    }

    func teardownAccessibilityForRemoval() {
        if showsFocusAccessibilityAnchor {
            NSAccessibility.post(
                element: focusAccessibilityAnchor,
                notification: .uiElementDestroyed)
            showsFocusAccessibilityAnchor = false
            focusAccessibilityAnchor.removeFromSuperview()
        }
        NSAccessibility.post(element: self, notification: .uiElementDestroyed)
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
        setAccessibilityRole(.staticText)
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

/// Web `EVENT_BASE_COLOR`: the fill for events with no color of their own.
private func defaultEventFill(for theme: NativeWebTheme) -> NSColor {
    switch theme {
    case .lightBeach:
        EventCardColorParser.nsColor(hex: "#454442") ?? .darkGray
    case .darkAbyss:
        EventCardColorParser.nsColor(hex: "#82A0B2") ?? .gray
    }
}

/// Web `theme.getContrastText`: whichever of the theme's text and on-accent
/// tokens reads better on the fill.
private func contrastText(on fill: NSColor, theme: NativeWebTheme) -> NSColor {
    let candidates: [NSColor] = switch theme {
    case .lightBeach:
        [ThemeTokens.lightBeach.text.nsColor, ThemeTokens.lightBeach.onAccent.nsColor]
    case .darkAbyss:
        [ThemeTokens.darkAbyss.onAccent.nsColor, ThemeTokens.darkAbyss.text.nsColor]
    }
    let fillLuminance = relativeLuminance(fill)
    func contrast(_ text: NSColor) -> CGFloat {
        let textLuminance = relativeLuminance(text)
        return (max(textLuminance, fillLuminance) + 0.05) / (min(textLuminance, fillLuminance) + 0.05)
    }
    return contrast(candidates[0]) >= contrast(candidates[1]) ? candidates[0] : candidates[1]
}

/// Web `eventFocusColor`: the card's color, or the theme text color when that
/// color is too light to read against the page paper.
private func unsettledOutlineColor(_ theme: NativeWebTheme) -> NSColor {
    let muted: NSColor = switch theme {
    case .lightBeach: ThemeTokens.lightBeach.textMuted.nsColor
    case .darkAbyss: ThemeTokens.darkAbyss.textMuted.nsColor
    }
    return muted.withAlphaComponent(0.5)
}

private func focusRingColor(fill: NSColor, theme: NativeWebTheme) -> NSColor {
    let text: NSColor = switch theme {
    case .lightBeach: ThemeTokens.lightBeach.text.nsColor
    case .darkAbyss: ThemeTokens.darkAbyss.text.nsColor
    }
    let fillLuminance = relativeLuminance(fill)
    let paperLuminance = relativeLuminance(ThemeTokens.lightBeach.background.nsColor)
    let contrast = (max(fillLuminance, paperLuminance) + 0.05) / (min(fillLuminance, paperLuminance) + 0.05)
    return contrast < 3 ? text : fill
}

private func relativeLuminance(_ color: NSColor) -> CGFloat {
    guard let rgb = color.usingColorSpace(.sRGB) else { return 0 }
    func linear(_ channel: CGFloat) -> CGFloat {
        channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * linear(rgb.redComponent)
        + 0.7152 * linear(rgb.greenComponent)
        + 0.0722 * linear(rgb.blueComponent)
}

extension EventCardView: NSTextFieldDelegate {
    func controlTextDidChange(_ obj: Notification) {
        guard showsInlineTitleEditor, obj.object as? NSTextField === titleField else { return }
        cardDelegate?.eventCardView(self, didEditDraftTitle: titleField.stringValue, eventId: eventId)
    }
}

/// Text clips independently so the card's external focus outline stays visible.
private final class EventCardTextContainerView: NSView {
    override var isFlipped: Bool { true }
}
