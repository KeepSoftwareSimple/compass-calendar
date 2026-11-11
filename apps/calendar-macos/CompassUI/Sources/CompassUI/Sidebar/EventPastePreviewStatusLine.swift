import CompassData
import SwiftUI

/// Web `EventPastePreviewIndicator`: hints while a paste placement outline is active.
struct EventPastePreviewStatusLine: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        if let text = model.eventPastePreviewStatusText {
            Text(text)
                .font(.rubik(11))
                .foregroundStyle(theme.textMutedColor)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("compass-native-event-paste-preview-status")
        }
    }
}
