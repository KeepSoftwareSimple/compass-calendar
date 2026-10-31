import CompassData
import CompassKit
import SwiftUI

/// Web `FirstEventPrompt`: bottom-left card until the first real event, then
/// a short celebration before it retires for good.
struct FirstEventPromptView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    private var onboardingStore: OnboardingStore { model.onboardingStore }

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
                        Text("Your calendar is ready. Add something to it.")
                            .font(.rubik(14))
                            .foregroundStyle(theme.textColor)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        NoticeDismissButton {
                            onboardingStore.dismissFirstEventPrompt()
                        }
                    }
                    Button {
                        model.createTimedDraft(activity: .createShortcut)
                    } label: {
                        HStack(spacing: 6) {
                            Text("Add event")
                            ShortcutHintChip(label: "C", style: .onAccent)
                        }
                        .font(.rubik(14, weight: .medium))
                        .foregroundStyle(theme.onAccentColor)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(theme.accentColor)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut("c", modifiers: [])
                    .accessibilityLabel("Add event")
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
