import CompassKit
import SwiftUI

public struct RecurrenceScopeDialogView: View {
    let isPresented: Bool
    let title: String
    @State private var selectedScope: ScopeEnum = .this
    let onCancel: () -> Void
    let onConfirm: (ScopeEnum) -> Void

    public init(
        isPresented: Bool,
        title: String,
        onCancel: @escaping () -> Void,
        onConfirm: @escaping (ScopeEnum) -> Void
    ) {
        self.isPresented = isPresented
        self.title = title
        self.onCancel = onCancel
        self.onConfirm = onConfirm
    }

    public var body: some View {
        if isPresented {
            VStack(alignment: .leading, spacing: 16) {
                ModalDialogTitle(title)
                scopeOption(.this, label: "This event")
                scopeOption(.thisAndFollowing, label: "This and following events")
                scopeOption(.all, label: "All events")
                HStack {
                    Spacer()
                    Button("Cancel", action: onCancel)
                        .keyboardShortcut(.cancelAction)
                    Button("Ok", action: { onConfirm(selectedScope) })
                        .keyboardShortcut(.defaultAction)
                }
            }
            .modalDialogChrome(
                maxWidth: 400,
                identifier: "compass-recurrence-scope-dialog"
            )
        }
    }

    private func scopeOption(_ scope: ScopeEnum, label: String) -> some View {
        ModalDialogRadioRow(
            label: label,
            isSelected: selectedScope == scope,
            identifier: "compass-recurrence-scope-\(scope.rawValue)",
            action: { selectedScope = scope }
        )
    }
}
