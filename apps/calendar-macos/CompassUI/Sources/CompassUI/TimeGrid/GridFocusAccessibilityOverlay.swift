import SwiftUI

/// SwiftUI mirror of grid focus for XCUITest. AppKit probes are not always visible in CI.
struct GridFocusAccessibilityOverlay: View {
    let focusedLabel: String?

    var body: some View {
        if let focusedLabel, !focusedLabel.isEmpty {
            Color.clear
                .frame(width: 1, height: 1)
                .accessibilityElement()
                .accessibilityIdentifier("compass-grid-event-focused")
                .accessibilityLabel(focusedLabel)
        }
    }
}
