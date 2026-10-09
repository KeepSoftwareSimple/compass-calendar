import SwiftUI

public struct DiscardUnsavedDraftDialogView: View {
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
            VStack(alignment: .leading, spacing: 16) {
                ModalDialogTitle("Discard unsaved changes?")
                HStack {
                    Spacer()
                    Button("Cancel", action: onCancel)
                        .keyboardShortcut(.cancelAction)
                    Button("Discard", role: .destructive, action: onDiscard)
                        .keyboardShortcut(.defaultAction)
                }
            }
            .modalDialogChrome(
                maxWidth: 360,
                identifier: "compass-discard-draft-dialog"
            )
        }
    }
}
