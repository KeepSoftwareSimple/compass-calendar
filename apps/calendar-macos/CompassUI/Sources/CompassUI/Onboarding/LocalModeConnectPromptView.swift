import CompassData
import CompassKit
import SwiftUI

/// Web `LocalModeConnectPrompt`: trial nudge for anonymous explorers.
struct LocalModeConnectPromptView: View {
    @Environment(\.nativeWebTheme) private var theme
    var model: NativeCalendarRootModel

    var body: some View {
        BottomNoticeView {
            Text("Start your free trial to save this calendar on every device.")
                .font(.rubik(NativeWebLayoutTokens.fontSizeXS))
                .foregroundStyle(theme.textMutedColor)
                .fixedSize(horizontal: false, vertical: true)
        } actions: {
            HStack(spacing: 6) {
                Button {
                    model.startTrialFromLocalModePrompt()
                } label: {
                    HStack(spacing: 6) {
                        Text("Start free trial")
                        ShortcutHintChip(label: "S", style: .onAccent)
                    }
                }
                .buttonStyle(CompactPrimaryButtonStyle())
                NoticeDismissButton {
                    model.onboardingStore.dismissLocalModeConnectPrompt()
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Start your free trial")
        .accessibilityIdentifier("compass-native-local-mode-connect-prompt")
        .onAppear { model.onboardingStore.trackLocalModeConnectPromptShownOnce() }
    }
}
