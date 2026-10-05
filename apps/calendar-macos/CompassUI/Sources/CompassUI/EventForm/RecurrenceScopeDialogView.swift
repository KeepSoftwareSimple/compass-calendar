import CompassKit
import SwiftUI

public struct RecurrenceScopeDialogView: View {
    @Environment(\.nativeWebTheme) private var theme
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
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                VStack(alignment: .leading, spacing: 16) {
                    Text(title)
                        .font(.custom("Rubik", size: 17, relativeTo: .headline))
                        .foregroundStyle(theme.textColor)
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
                .padding(20)
                .frame(maxWidth: 400)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityIdentifier("compass-recurrence-scope-dialog")
            }
        }
    }

    private func scopeOption(_ scope: ScopeEnum, label: String) -> some View {
        Button {
            selectedScope = scope
        } label: {
            HStack(spacing: 12) {
                Circle()
                    .strokeBorder(theme.borderColor, lineWidth: 2)
                    .background(
                        Circle()
                            .fill(selectedScope == scope ? theme.accentColor : .clear)
                            .padding(4)
                    )
                    .frame(width: 18, height: 18)
                Text(label)
                    .foregroundStyle(theme.textColor)
                Spacer()
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("compass-recurrence-scope-\(scope.rawValue)")
    }
}
