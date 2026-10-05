import SwiftUI

struct EventFormToolbarView: View {
    @Environment(\.nativeWebTheme) private var theme
    let isExistingEvent: Bool
    let onClose: () -> Void
    let onDuplicate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            toolbarButton(label: "Close", systemImage: "xmark", action: onClose)
            if isExistingEvent {
                toolbarButton(label: "Duplicate", systemImage: "plus.square.on.square", action: onDuplicate)
                toolbarButton(label: "Delete", systemImage: "trash", action: onDelete)
            }
            Spacer()
        }
        .accessibilityIdentifier("compass-event-form-actions")
    }

    private func toolbarButton(label: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(theme.textMutedColor)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
