import SwiftUI

/// SwiftUI mirror of grid focus for XCUITest. AppKit probes are not always visible in CI.
struct GridFocusAccessibilityOverlay: View {
    let focusedLabel: String?

    var body: some View {
        Text(focusedLabel ?? "")
            .frame(width: 44, height: 44)
            .opacity(0.01)
            .accessibilityElement()
            .accessibilityIdentifier("compass-grid-event-focused")
            .accessibilityLabel(focusedLabel ?? "")
            .accessibilityValue(focusedLabel ?? "")
            .accessibilityHidden(focusedLabel?.isEmpty != false)
            .allowsHitTesting(false)
    }
}
