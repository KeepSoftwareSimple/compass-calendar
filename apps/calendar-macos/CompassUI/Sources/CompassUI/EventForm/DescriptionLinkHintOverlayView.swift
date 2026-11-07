import AppKit

/// Per-link digit keycaps aligned to reserved inline slots after each link.
final class DescriptionLinkHintOverlayView: NSView {
    weak var textView: DescriptionTextView?
    var hintsVisible = false {
        didSet {
            laidOutLinkHintCount = -1
            needsLayout = true
        }
    }
    private var isLayingOutLinkHints = false
    private var laidOutLinkHintCount = -1

    override var isFlipped: Bool { true }

    override func layout() {
        super.layout()
        guard !isLayingOutLinkHints else { return }
        guard hintsVisible,
              let textView,
              textView.window != nil,
              textView.window === window,
              let layoutManager = textView.layoutManager,
              let textContainer = textView.textContainer
        else {
            if !subviews.isEmpty {
                subviews.forEach { $0.removeFromSuperview() }
            }
            laidOutLinkHintCount = -1
            return
        }

        let storage = textView.textStorage
        let length = storage?.length ?? 0
        guard length > 0 else {
            if !subviews.isEmpty {
                subviews.forEach { $0.removeFromSuperview() }
            }
            laidOutLinkHintCount = -1
            return
        }

        var linkCount = 0
        storage?.enumerateAttribute(.link, in: NSRange(location: 0, length: length)) { _, _, _ in
            linkCount += 1
        }
        if linkCount == laidOutLinkHintCount, subviews.count == linkCount, linkCount > 0 {
            return
        }

        isLayingOutLinkHints = true
        defer { isLayingOutLinkHints = false }

        subviews.forEach { $0.removeFromSuperview() }
        laidOutLinkHintCount = linkCount
        guard linkCount > 0 else { return }

        var linkIndex = 0
        storage?.enumerateAttribute(.link, in: NSRange(location: 0, length: length)) { _, range, _ in
            guard linkIndex < 9 else { return }
            let glyphRange = layoutManager.glyphRange(
                forCharacterRange: range,
                actualCharacterRange: nil
            )
            let linkRect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
            let slotOrigin = textView.convert(
                NSPoint(
                    x: linkRect.maxX - DescriptionLinkHintSlotAttachment.slotWidth,
                    y: linkRect.minY
                ),
                to: self
            )

            let chip = DescriptionLinkHintChipView()
            chip.label = String(linkIndex + 1)
            chip.frame = CGRect(
                x: slotOrigin.x + 2,
                y: slotOrigin.y + max(0, (linkRect.height - 18) / 2),
                width: DescriptionLinkHintSlotAttachment.slotWidth - 2,
                height: 18
            )
            chip.setAccessibilityIdentifier("compass-description-link-digit-\(linkIndex + 1)")
            addSubview(chip)
            linkIndex += 1
        }
        if hintsVisible, linkIndex > 0 {
            setAccessibilityIdentifier("compass-description-link-digit-hints")
        } else {
            setAccessibilityIdentifier("")
        }
    }
}
