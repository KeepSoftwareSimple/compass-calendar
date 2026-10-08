import CompassData
import CompassKit
import SwiftUI

public struct OnboardingOverlay: View {
    @Bindable public var model: NativeCalendarRootModel

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        switch model.activeOnboardingSurface {
        case .welcomeModal:
            WelcomeModalView(model: model)
        case .welcomeGuide:
            WelcomeGuideModalView(onboardingStore: model.onboardingStore)
        case .connectCalendarPrompt:
            ConnectCalendarPromptView(model: model)
        case .firstEventPrompt:
            FirstEventPromptView(onboardingStore: model.onboardingStore)
        case .billingGate, .checkoutCelebration, .shortcutShowcase, .pointerHint, .none:
            EmptyView()
        }
    }
}
