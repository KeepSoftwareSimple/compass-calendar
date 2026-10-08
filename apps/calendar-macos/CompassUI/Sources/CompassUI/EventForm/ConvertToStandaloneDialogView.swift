import SwiftUI

public struct ConvertToStandaloneDialogView: View {
    @Environment(\.nativeWebTheme) private var theme
    let isPresented: Bool
    let eventTitle: String
    let onCancel: () -> Void
    let onConfirm: () -> Void

    public init(
        isPresented: Bool,
        eventTitle: String,
        onCancel: @escaping () -> Void,
        onConfirm: @escaping () -> Void
    ) {
        self.isPresented = isPresented
        self.eventTitle = eventTitle
        self.onCancel = onCancel
        self.onConfirm = onConfirm
    }

    public var body: some View {
        if isPresented {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                VStack(alignment: .leading, spacing: 16) {
                    Text("Convert to standalone event?")
                        .font(.custom("Rubik", size: 17, relativeTo: .headline))
                        .foregroundStyle(theme.textColor)
                    Text("\"\(eventTitle)\" will be removed from its recurring series.")
                        .font(.custom("Rubik", size: 14))
                        .foregroundStyle(theme.textMutedColor)
                    HStack {
                        Spacer()
                        Button("Cancel", action: onCancel)
                            .keyboardShortcut(.cancelAction)
                        Button("Convert", action: onConfirm)
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
                .accessibilityIdentifier("compass-convert-standalone-dialog")
            }
        }
    }
}
