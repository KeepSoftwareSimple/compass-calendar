import CompassData
import CompassKit
import SwiftUI

/// Web `LocalModeConnectPrompt`: trial nudge for anonymous explorers.
struct LocalModeConnectPromptView: View {
    var model: NativeCalendarRootModel

    var body: some View {
        BottomNoticeView(
            message: "Start your free trial to save this calendar on every device.",
            onDismiss: { model.onboardingStore.dismissLocalModeConnectPrompt() }
        ) {
            Button {
                model.startTrialFromLocalModePrompt()
            } label: {
                HStack(spacing: 4) {
                    Text("Start free trial")
                    ShortcutHintChip(label: "S", style: .onAccent)
                }
            }
            .buttonStyle(NoticeCompactPrimaryButtonStyle())
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Start your free trial")
        .accessibilityIdentifier("compass-native-local-mode-connect-prompt")
        .onAppear { model.onboardingStore.trackLocalModeConnectPromptShownOnce() }
    }
}
