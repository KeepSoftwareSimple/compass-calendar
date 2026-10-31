import CompassKit
import SwiftUI

/// Web `WelcomeKeyboardShortcutsStep`.
struct WelcomeKeyboardShortcutsStepView: View {
    @Environment(\.nativeWebTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(WelcomeKeyboardShortcutsCopy.title)
                    .font(.rubik(24, weight: .bold))
                    .foregroundStyle(theme.textColor)
                Text(WelcomeKeyboardShortcutsCopy.subtitle)
                    .font(.rubik(16))
                    .foregroundStyle(theme.textMutedColor)
            }
            VStack(spacing: 8) {
                ForEach(WelcomeKeyboardShortcutsCopy.rows, id: \.label) { row in
                    HStack {
                        Text(row.label)
                            .font(.rubik(14))
                            .foregroundStyle(theme.textColor)
                        Spacer(minLength: 8)
                        HStack(spacing: 4) {
                            ForEach(row.keycaps, id: \.self) { keycap in
                                ShortcutHintChip(label: keycap)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(theme.surfaceColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(theme.borderColor, lineWidth: 1))
                }
            }
        }
    }
}
