import AppKit

/// Per-link digit keycaps aligned to reserved inline slots after each link.
final class DescriptionLinkHintOverlayView: NSView {
    weak var textView: DescriptionTextView?
    var hintsVisible = false {
        didSet {
            laidOutFingerprint = nil
            needsLayout = true
        }
    }
    private var isLayingOutLinkHints = false
    private var laidOutFingerprint: LayoutFingerprint?

    /// Placement + geometry inputs for digit keycaps (not hint visibility).
    private struct LayoutFingerprint: Equatable {
        let linksPlacementKey: String
        let overlayBoundsSize: NSSize
        let textContainerWidth: CGFloat
        let numberOfGlyphs: Int
    }

    func invalidateLayoutCache() {
        laidOutFingerprint = nil
    }

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
            laidOutFingerprint = nil
            return
        }

        let linkEntries = textView.orderedLinkAttributeEntries()
        guard !linkEntries.isEmpty else {
            if !subviews.isEmpty {
                subviews.forEach { $0.removeFromSuperview() }
            }
            laidOutFingerprint = nil
            setAccessibilityIdentifier("")
            return
        }

        let fingerprint = LayoutFingerprint(
            linksPlacementKey: linkEntries.map { entry in
                "\(entry.range.location):\(entry.range.length):\(entry.href)"
            }.joined(separator: "\u{1e}"),
            overlayBoundsSize: bounds.size,
            textContainerWidth: textContainer.containerSize.width,
            numberOfGlyphs: layoutManager.numberOfGlyphs
        )
        if fingerprint == laidOutFingerprint, subviews.count == linkEntries.count {
            return
        }

        isLayingOutLinkHints = true
        defer { isLayingOutLinkHints = false }

        subviews.forEach { $0.removeFromSuperview() }

        var linkIndex = 0
        for entry in linkEntries {
            guard linkIndex < 9 else { break }
            let glyphRange = layoutManager.glyphRange(
                forCharacterRange: entry.range,
                actualCharacterRange: nil
            )
            guard glyphRange.length > 0 else { continue }
            layoutManager.ensureLayout(forGlyphRange: glyphRange)
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

        laidOutFingerprint = fingerprint
        if hintsVisible, linkIndex > 0 {
            setAccessibilityIdentifier("compass-description-link-digit-hints")
        } else {
            setAccessibilityIdentifier("")
        }
    }
}
