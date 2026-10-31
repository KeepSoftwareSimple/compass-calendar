import CompassData
import CompassKit
import SwiftUI

/// Web `FirstEventPrompt`: bottom-left notice until the first real event.
struct FirstEventPromptView: View {
    @Bindable var onboardingStore: OnboardingStore

    var body: some View {
        Group {
            if onboardingStore.isFirstEventCelebrating {
                BottomNoticeView(message: "It's on the calendar.", onDismiss: nil) {
                    EmptyView()
                }
                .task {
                    try? await Task.sleep(for: .seconds(4))
                    onboardingStore.finalizeFirstEventCelebration()
                }
            } else {
                BottomNoticeView(
                    message: "Add your first event.",
                    onDismiss: { onboardingStore.dismissFirstEventPrompt() }
                ) {
                    Button {} label: {
                        HStack(spacing: 4) {
                            Text("Add Coffee")
                            ShortcutHintChip(label: "C", style: .onAccent)
                        }
                    }
                    .buttonStyle(NoticeCompactPrimaryButtonStyle())
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
