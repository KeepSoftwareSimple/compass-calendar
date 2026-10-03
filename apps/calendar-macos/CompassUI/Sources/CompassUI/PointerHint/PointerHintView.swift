import CompassData
import CompassKit
import SwiftUI

struct PointerHintView: View {
    @Environment(\.nativeWebTheme) private var theme
    let store: PointerHintStore
    let registry: ShortcutRegistry?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let focusedEventLabel = store.focusedGridEventLabel {
                Text(focusedEventLabel)
                    .font(.custom("Rubik", size: 14, relativeTo: .body))
                    .foregroundStyle(theme.textColor)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: 520, alignment: .leading)
                    .accessibilityElement()
                    .accessibilityAddTraits(.isButton)
                    .accessibilityIdentifier("compass-grid-event-focused")
                    .accessibilityLabel(focusedEventLabel)
            }
            if store.isVisible, let attempt = store.attempt {
                HStack(alignment: .top, spacing: 8) {
                    Text(attributedMessage(attempt))
                        .font(.custom("Rubik", size: 14, relativeTo: .body))
                        .foregroundStyle(theme.textColor)
                        .multilineTextAlignment(.leading)
                    Button("Dismiss") {
                        store.hide()
                    }
                    .buttonStyle(.plain)
                    .font(.custom("Rubik", size: 12, relativeTo: .caption))
                    .foregroundStyle(theme.textMutedColor)
                    .accessibilityLabel("Turn off keyboard tips")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(theme.surfacePanelColor.opacity(0.95))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(theme.borderColor, lineWidth: 1)
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
                .frame(maxWidth: 520)
                .accessibilityElement()
                .accessibilityAddTraits(.isStaticText)
                .accessibilityIdentifier("compass-pointer-hint")
            }
        }
    }

    private func attributedMessage(_ attempt: PointerHintAttempt) -> AttributedString {
        var result = AttributedString()
        let parts = attempt.message.split(separator: /(\{\d+\})/, omittingEmptySubsequences: false)
        for part in parts {
            if let match = part.firstMatch(of: /\{(\d+)\}/) {
                let index = Int(match.1) ?? 0
                if attempt.keycapGroups.indices.contains(index) {
                    let keys = attempt.keycapGroups[index].joined(separator: "+")
                    result.append(AttributedString(keys))
                }
            } else {
                result.append(AttributedString(String(part)))
            }
        }
        return result
    }
}
