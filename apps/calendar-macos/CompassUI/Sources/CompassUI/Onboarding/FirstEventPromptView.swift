import CompassData
import CompassKit
import SwiftUI

/// Web `FirstEventPrompt`: bottom-left card until the first real event, then
/// a short celebration before it retires for good.
struct FirstEventPromptView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var onboardingStore: OnboardingStore

    var body: some View {
        FloatingNoticeCard(width: 288) {
            if onboardingStore.isFirstEventCelebrating {
                Text("It's on the calendar.")
                    .font(.rubik(14, weight: .semibold))
                    .foregroundStyle(theme.textColor)
                    .padding(.vertical, 8)
                    .task {
                        try? await Task.sleep(for: .seconds(4))
                        onboardingStore.finalizeFirstEventCelebration()
                    }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 8) {
                        Text("Add your first event")
                            .font(.rubik(14, weight: .semibold))
                            .foregroundStyle(theme.textColor)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        NoticeDismissButton {
                            onboardingStore.dismissFirstEventPrompt()
                        }
                    }
                    HStack(spacing: 6) {
                        Text("Press")
                        ShortcutHintChip(label: "C")
                        Text(", type a title, then Enter.")
                    }
                    .font(.rubik(12))
                    .foregroundStyle(theme.textMutedColor)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Create your first event")
        .accessibilityIdentifier("compass-native-first-event-prompt")
        .onAppear {
            onboardingStore.trackFirstEventShownOnce()
        }
    }
}
