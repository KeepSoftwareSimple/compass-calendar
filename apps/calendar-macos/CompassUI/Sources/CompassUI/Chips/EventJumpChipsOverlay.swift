import CompassKit
import SwiftUI

struct EventJumpChipsOverlay: View {
    let hints: [EventJumpChipHint]
    let gridYOffset: CGFloat
    let visible: Bool

    var body: some View {
        if visible, !hints.isEmpty {
            GeometryReader { geometry in
                ForEach(hints) { hint in
                    ShortcutHintChip(label: hint.label)
                        .position(
                            x: hint.frame.left + hint.frame.width - 14,
                            y: gridYOffset + hint.frame.top + 12
                        )
                }
            }
            .allowsHitTesting(false)
            .accessibilityIdentifier("compass-event-jump-chips")
        }
    }
}
