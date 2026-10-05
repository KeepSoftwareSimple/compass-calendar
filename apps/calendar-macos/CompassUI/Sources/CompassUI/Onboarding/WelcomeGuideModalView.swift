import CompassData
import SwiftUI

struct WelcomeGuideModalView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var onboardingStore: OnboardingStore

    var body: some View {
        ZStack {
            theme.overlayBackdropColor
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("The Keyboard Calendar")
                    .font(.custom("Rubik", size: 22, relativeTo: .title))
                    .foregroundStyle(theme.textColor)
                Text(
                    "Rediscover the joy of shortcuts as you build your perfect schedule. "
                        + "Press ? for every shortcut once you are on the calendar.")
                    .font(.custom("Rubik", size: 14))
                    .foregroundStyle(theme.textMutedColor)
                Button("Close") {
                    onboardingStore.closeWelcomeGuide()
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.surfaceColor)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(theme.accentColor)
                .clipShape(Capsule())
            }
            .padding(24)
            .frame(maxWidth: 480)
            .background(theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityLabel("Welcome to Compass Calendar")
            .accessibilityIdentifier("compass-native-welcome-guide")
        }
    }
}
