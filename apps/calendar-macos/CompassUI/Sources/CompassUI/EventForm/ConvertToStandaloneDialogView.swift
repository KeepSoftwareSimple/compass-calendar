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
            VStack(alignment: .leading, spacing: 16) {
                ModalDialogTitle("Convert to standalone event?")
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
            .modalDialogChrome(
                maxWidth: 400,
                identifier: "compass-convert-standalone-dialog"
            )
        }
    }
}
