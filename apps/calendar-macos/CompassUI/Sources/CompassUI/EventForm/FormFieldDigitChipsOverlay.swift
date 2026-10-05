import CompassData
import SwiftUI

struct FormFieldDigitChipsOverlay: View {
    let targets: [PageJumpTarget]
    let anchors: [String: Anchor<CGRect>]
    let visible: Bool

    var body: some View {
        if visible {
            GeometryReader { geometry in
                ForEach(targets) { target in
                    if let anchor = anchors[target.id] {
                        let rect = geometry[anchor]
                        ShortcutHintChip(label: target.digit)
                            .position(x: rect.maxX - 12, y: rect.minY + 12)
                    }
                }
            }
            .allowsHitTesting(false)
            .accessibilityIdentifier("compass-form-field-digit-chips")
        }
    }
}
