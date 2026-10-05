import SwiftUI

public struct DiscardUnsavedDraftDialogView: View {
    @Environment(\.nativeWebTheme) private var theme
    let isPresented: Bool
    let onCancel: () -> Void
    let onDiscard: () -> Void

    public init(
        isPresented: Bool,
        onCancel: @escaping () -> Void,
        onDiscard: @escaping () -> Void
    ) {
        self.isPresented = isPresented
        self.onCancel = onCancel
        self.onDiscard = onDiscard
    }

    public var body: some View {
        if isPresented {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                VStack(alignment: .leading, spacing: 16) {
                    Text("Discard unsaved changes?")
                        .font(.custom("Rubik", size: 17, relativeTo: .headline))
                        .foregroundStyle(theme.textColor)
                    HStack {
                        Spacer()
                        Button("Cancel", action: onCancel)
                            .keyboardShortcut(.cancelAction)
                        Button("Discard", role: .destructive, action: onDiscard)
                            .keyboardShortcut(.defaultAction)
                    }
                }
                .padding(20)
                .frame(maxWidth: 360)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityIdentifier("compass-discard-draft-dialog")
            }
        }
    }
}
