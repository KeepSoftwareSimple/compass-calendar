import CompassData
import CompassKit
import SwiftUI

/// Web `FirstEventPrompt`: bottom-left notice until the first real event.
struct FirstEventPromptView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var onboardingStore: OnboardingStore

    var body: some View {
        Group {
            if onboardingStore.isFirstEventCelebrating {
                BottomNoticeView {
                    Text("It's on the calendar.")
                        .font(.rubik(NativeWebLayoutTokens.fontSizeXS))
                        .foregroundStyle(theme.textMutedColor)
                } actions: {
                    EmptyView()
                }
                .task {
                    try? await Task.sleep(for: .seconds(4))
                    onboardingStore.finalizeFirstEventCelebration()
                }
            } else {
                BottomNoticeView {
                    Text("Add your first event.")
                        .font(.rubik(NativeWebLayoutTokens.fontSizeXS))
                        .foregroundStyle(theme.textMutedColor)
                        .fixedSize(horizontal: false, vertical: true)
                } actions: {
                    HStack(spacing: 6) {
                        Button {} label: {
                            HStack(spacing: 6) {
                                Text("Add Coffee")
                                ShortcutHintChip(label: "C", style: .onAccent)
                            }
                        }
                        .buttonStyle(CompactPrimaryButtonStyle())
                        NoticeDismissButton {
                            onboardingStore.dismissFirstEventPrompt()
                        }
                    }
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
