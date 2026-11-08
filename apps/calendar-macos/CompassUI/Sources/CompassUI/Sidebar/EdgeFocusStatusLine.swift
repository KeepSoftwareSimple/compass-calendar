import CompassData
import SwiftUI

/// Web `EdgeFocusIndicator` while an event edge or whole-body move is focused.
struct EdgeFocusStatusLine: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        if let text = model.edgeFocusStatusText {
            Text(text)
                .font(.rubik(11))
                .foregroundStyle(theme.textMutedColor)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("compass-native-edge-focus-status")
                .transition(.opacity.combined(with: .move(edge: .bottom)))
                .animation(.easeInOut(duration: 0.2), value: text)
        }
    }
}
