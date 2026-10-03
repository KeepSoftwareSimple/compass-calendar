import SwiftUI

/// SwiftUI accessibility surface for XCUITest. AppKit subviews on the window
/// do not reliably expose `accessibilityIdentifier` to XCUI queries (see
/// `CompassBridgeAccessibility` and `compass-pointer-hint`).
struct GridFocusAccessibilityOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    let label: String
    let focusEventId: String

    var body: some View {
        Text(label)
            .font(.custom("Rubik", size: 14, relativeTo: .body))
            .foregroundStyle(theme.backgroundColor)
            .accessibilityElement()
            .accessibilityAddTraits(.isStaticText)
            .accessibilityIdentifier("compass-grid-event-focused")
            .accessibilityLabel(label)
            .allowsHitTesting(false)
            .padding(.top, 16)
            .padding(.leading, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .id("\(focusEventId)-\(label)")
    }
}
