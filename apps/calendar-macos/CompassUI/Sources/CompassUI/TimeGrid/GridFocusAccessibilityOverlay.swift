import SwiftUI

/// SwiftUI mirror of grid focus for XCUITest. AppKit probes are not always visible in CI.
struct GridFocusAccessibilityOverlay: View {
    let focusedLabel: String?

    var body: some View {
        Color.clear
            .frame(width: 44, height: 44)
            .accessibilityElement()
            .accessibilityIdentifier("compass-grid-event-focused")
            .accessibilityLabel(focusedLabel ?? "")
            .accessibilityValue(focusedLabel ?? "")
            .accessibilityHidden(focusedLabel?.isEmpty != false)
            .allowsHitTesting(false)
    }
}
