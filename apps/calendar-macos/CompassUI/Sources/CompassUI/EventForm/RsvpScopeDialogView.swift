import SwiftUI

public struct RsvpScopeDialogView: View {
    let isPresented: Bool
    @State private var selectedScope = "single"
    let onCancel: () -> Void
    let onConfirm: (String) -> Void

    public init(
        isPresented: Bool,
        onCancel: @escaping () -> Void,
        onConfirm: @escaping (String) -> Void
    ) {
        self.isPresented = isPresented
        self.onCancel = onCancel
        self.onConfirm = onConfirm
    }

    public var body: some View {
        if isPresented {
            VStack(alignment: .leading, spacing: 16) {
                ModalDialogTitle("Respond for")
                VStack(alignment: .leading, spacing: 8) {
                    scopeRow("single", label: "This Event")
                    scopeRow("all", label: "All Events")
                }
                HStack {
                    Spacer()
                    Button("Cancel", action: onCancel)
                        .keyboardShortcut(.cancelAction)
                    Button("Ok") { onConfirm(selectedScope) }
                        .keyboardShortcut(.defaultAction)
                }
            }
            .modalDialogChrome(
                maxWidth: 360,
                identifier: "compass-rsvp-scope-dialog"
            )
        }
    }

    private func scopeRow(_ scope: String, label: String) -> some View {
        ModalDialogRadioRow(
            label: label,
            isSelected: selectedScope == scope,
            identifier: "compass-rsvp-scope-\(scope)",
            action: { selectedScope = scope }
        )
    }
}
