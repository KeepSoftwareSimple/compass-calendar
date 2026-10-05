import CompassData
import CompassKit
import SwiftUI

struct WelcomeModalView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        ZStack {
            theme.overlayBackdropColor
                .ignoresSafeArea()
            VStack(spacing: 20) {
                headerRow
                stepContent
                stepDots
            }
            .padding(24)
            .frame(maxWidth: 480)
            .background(theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.borderColor, lineWidth: 1)
            )
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityLabel("Welcome to Compass Calendar")
            .accessibilityIdentifier("compass-native-welcome-modal")
        }
        .onAppear {
            model.onboardingStore.setWelcomeFirstVisitOpen(true)
            model.onboardingStore.trackWelcomeShownIfNeeded()
        }
        .onDisappear {
            model.onboardingStore.setWelcomeFirstVisitOpen(false)
        }
    }

    private var headerRow: some View {
        HStack {
            Text("Compass")
                .font(.custom("Rubik", size: 14, relativeTo: .headline))
                .foregroundStyle(theme.textMutedColor)
            Spacer()
            if model.onboardingStore.welcomeStep > 1 {
                Button("Back") {
                    model.onboardingStore.retreatWelcomeStep()
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.textMutedColor)
            }
            Button("Log in") {
                model.onboardingStore.markWelcomeSeen(exit: "log_in")
                model.authStore.openModal(.login)
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.textMutedColor)
        }
    }

    @ViewBuilder
    private var stepContent: some View {
        switch model.onboardingStore.welcomeStep {
        case 1:
            VStack(alignment: .leading, spacing: 12) {
                Text("The Keyboard Calendar")
                    .font(.custom("Rubik", size: 22, relativeTo: .title))
                    .foregroundStyle(theme.textColor)
                Text(
                    "Rediscover the joy of shortcuts as you build your perfect schedule. "
                        + "Click any button here, or use Enter and the key hints beside each action.")
                    .font(.custom("Rubik", size: 14))
                    .foregroundStyle(theme.textMutedColor)
                primaryButton(title: "Get started for free") {
                    model.onboardingStore.advanceWelcomeStep()
                }
            }
        case 2:
            VStack(alignment: .leading, spacing: 12) {
                Text("How Compass works")
                    .font(.custom("Rubik", size: 22, relativeTo: .title))
                    .foregroundStyle(theme.textColor)
                Text("Compass is keyboard-only on the calendar. Press ? for every shortcut.")
                    .font(.custom("Rubik", size: 14))
                    .foregroundStyle(theme.textMutedColor)
                primaryButton(title: "Next") {
                    model.onboardingStore.advanceWelcomeStep()
                }
            }
        default:
            VStack(alignment: .leading, spacing: 12) {
                Text("Let's get started")
                    .font(.custom("Rubik", size: 22, relativeTo: .title))
                    .foregroundStyle(theme.textColor)
                Text("Connect a calendar or start fresh")
                    .font(.custom("Rubik", size: 14))
                    .foregroundStyle(theme.textMutedColor)
                primaryButton(title: "Explore without an account") {
                    model.onboardingStore.markWelcomeSeen(exit: "explore")
                    model.authStore.closeModal()
                }
                Button("Sign up with email") {
                    model.onboardingStore.markWelcomeSeen(exit: "sign_up")
                    model.authStore.openModal(.signUp)
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.textColor)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(theme.borderColor.opacity(0.35))
                .clipShape(Capsule())
            }
        }
    }

    private var stepDots: some View {
        HStack(spacing: 8) {
            ForEach(1 ... 3, id: \.self) { step in
                Circle()
                    .fill(step == model.onboardingStore.welcomeStep ? theme.textColor : theme.borderColor)
                    .frame(width: 6, height: 6)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func primaryButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Rubik", size: 14, relativeTo: .body))
                .foregroundStyle(theme.surfaceColor)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(theme.accentColor)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
