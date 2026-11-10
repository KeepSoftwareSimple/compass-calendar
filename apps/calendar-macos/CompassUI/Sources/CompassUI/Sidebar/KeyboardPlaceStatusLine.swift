import CompassData
import SwiftUI

/// Web `KeyboardPlaceIndicator`: Enter opens the placed draft, Esc discards.
struct KeyboardPlaceStatusLine: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        if model.showsKeyboardPlaceSidebarHint {
            HStack(spacing: 4) {
                ShortcutHintChip(label: "Enter")
                Text("to open")
                    .font(.rubik(11))
                    .foregroundStyle(theme.textMutedColor)
                Text("·")
                    .font(.rubik(11))
                    .foregroundStyle(theme.textMutedColor)
                ShortcutHintChip(label: "Esc")
                Text("to discard")
                    .font(.rubik(11))
                    .foregroundStyle(theme.textMutedColor)
            }
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .accessibilityIdentifier("compass-native-keyboard-place-status")
        }
    }
}
