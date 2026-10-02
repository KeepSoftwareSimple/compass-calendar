import SwiftUI

struct ShortcutHintChip: View {
    let label: String
    @Environment(\.nativeWebTheme) private var theme

    var body: some View {
        Text(label)
            .font(.custom("Rubik", size: 11, relativeTo: .caption))
            .foregroundStyle(theme.textColor)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(theme.surfacePanelColor.opacity(0.95))
            .overlay {
                RoundedRectangle(cornerRadius: 4)
                    .stroke(theme.borderColor, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
    }
}
