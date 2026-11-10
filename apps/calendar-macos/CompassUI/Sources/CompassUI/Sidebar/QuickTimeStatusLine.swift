import CompassData
import SwiftUI

/// Web `QuickTimeIndicator`: echoes half-typed grid quick-time digits.
struct QuickTimeStatusLine: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        let digits = model.draftStore.quickTimeDigits
        if CalendarGridSidebarHints.calendarGridModeHintsEligible(
            isLifeView: model.viewStore.view == .life),
            !digits.isEmpty
        {
            HStack(spacing: 4) {
                Text("New event at")
                    .font(.rubik(11))
                    .foregroundStyle(theme.textMutedColor)
                Text(paddedQuickTimeDigits(digits))
                    .font(.rubik(11, weight: .medium))
                    .foregroundStyle(theme.textColor)
                Text("·")
                    .font(.rubik(11))
                    .foregroundStyle(theme.textMutedColor)
                ShortcutHintChip(label: "Esc")
            }
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .accessibilityIdentifier("compass-native-quick-time-status")
        }
    }

    private func paddedQuickTimeDigits(_ digits: String) -> String {
        var padded = digits
        while padded.count < 4 { padded.append("_") }
        return padded
    }
}
