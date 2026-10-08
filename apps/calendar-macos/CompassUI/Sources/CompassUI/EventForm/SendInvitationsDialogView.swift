import CompassData
import SwiftUI

public struct SendInvitationsDialogView: View {
    @Environment(\.nativeWebTheme) private var theme
    let prompt: EventInvitationPromptState?
    let onCancel: () -> Void
    let onDontSend: () -> Void
    let onSend: () -> Void

    public init(
        prompt: EventInvitationPromptState?,
        onCancel: @escaping () -> Void,
        onDontSend: @escaping () -> Void,
        onSend: @escaping () -> Void
    ) {
        self.prompt = prompt
        self.onCancel = onCancel
        self.onDontSend = onDontSend
        self.onSend = onSend
    }

    public var body: some View {
        if let prompt {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                VStack(alignment: .leading, spacing: 16) {
                    Text("Send invitation emails?")
                        .font(.custom("Rubik", size: 17, relativeTo: .headline))
                        .foregroundStyle(theme.textColor)
                    Text("\(prompt.hostLabel) will email the affected guests about this event.")
                        .font(.custom("Rubik", size: 13))
                        .foregroundStyle(theme.textMutedColor)
                    HStack {
                        Spacer()
                        Button("Don't send", action: onDontSend)
                        Button("Send", action: onSend)
                            .keyboardShortcut(.defaultAction)
                    }
                }
                .padding(20)
                .frame(maxWidth: 400)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityIdentifier("compass-send-invitations-dialog")
            }
            .onExitCommand(perform: onCancel)
        }
    }
}
