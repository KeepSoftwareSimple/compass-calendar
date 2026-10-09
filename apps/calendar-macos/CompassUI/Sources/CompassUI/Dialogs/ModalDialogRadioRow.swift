import SwiftUI

/// One choice in a dialog that asks which events an edit applies to: a ring
/// that fills when selected, the label, and the whole row as the hit target.
struct ModalDialogRadioRow: View {
    @Environment(\.nativeWebTheme) private var theme
    let label: String
    let isSelected: Bool
    let identifier: String
    let action: () -> Void

    init(
        label: String,
        isSelected: Bool,
        identifier: String,
        action: @escaping () -> Void
    ) {
        self.label = label
        self.isSelected = isSelected
        self.identifier = identifier
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Circle()
                    .strokeBorder(theme.borderColor, lineWidth: 2)
                    .background(
                        Circle()
                            .fill(isSelected ? theme.accentColor : .clear)
                            .padding(4)
                    )
                    .frame(width: 18, height: 18)
                Text(label)
                    .foregroundStyle(theme.textColor)
                Spacer()
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}
