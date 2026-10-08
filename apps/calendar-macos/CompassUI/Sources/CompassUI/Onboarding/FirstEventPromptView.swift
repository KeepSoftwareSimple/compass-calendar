import CompassData
import SwiftUI

struct FirstEventPromptView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var onboardingStore: OnboardingStore

    var body: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                card
                    .padding(24)
            }
        }
        .allowsHitTesting(true)
        .onAppear {
            onboardingStore.trackFirstEventShownOnce()
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 8) {
            if onboardingStore.isFirstEventCelebrating {
                Text("It's on the calendar.")
                    .font(.custom("Rubik", size: 14, relativeTo: .headline))
                    .foregroundStyle(theme.textColor)
                    .onAppear {
                        Task {
                            try? await Task.sleep(for: .seconds(4))
                            onboardingStore.finalizeFirstEventCelebration()
                        }
                    }
            } else {
                HStack {
                    Text("Add your first event")
                        .font(.custom("Rubik", size: 14, relativeTo: .headline))
                        .foregroundStyle(theme.textColor)
                    Spacer()
                    Button("Dismiss") {
                        onboardingStore.dismissFirstEventPrompt()
                    }
                    .buttonStyle(.plain)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
                }
                Text("Press C, type a title, then Enter.")
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
            }
        }
        .padding(16)
        .frame(width: 288)
        .background(theme.surfaceColor.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(theme.borderColor, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Create your first event")
        .accessibilityIdentifier("compass-native-first-event-prompt")
    }
}
