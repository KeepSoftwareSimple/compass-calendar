import SwiftUI

public struct RsvpScopeDialogView: View {
    @Environment(\.nativeWebTheme) private var theme
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
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                VStack(alignment: .leading, spacing: 16) {
                    Text("Respond for")
                        .font(.custom("Rubik", size: 17, relativeTo: .headline))
                        .foregroundStyle(theme.textColor)
                    VStack(alignment: .leading, spacing: 8) {
                        scopeRow("single", label: "This Event")
                        scopeRow("all", label: "All Events")
                    }
                    HStack {
                        Spacer()
                        Button("Cancel", action: onCancel)
                        Button("Ok") { onConfirm(selectedScope) }
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
                .accessibilityIdentifier("compass-rsvp-scope-dialog")
            }
        }
    }

    private func scopeRow(_ scope: String, label: String) -> some View {
        Button {
            selectedScope = scope
        } label: {
            HStack {
                Image(systemName: selectedScope == scope ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selectedScope == scope ? theme.accentColor : theme.textMutedColor)
                Text(label)
                    .foregroundStyle(theme.textColor)
                Spacer()
            }
        }
        .buttonStyle(.plain)
    }
}
