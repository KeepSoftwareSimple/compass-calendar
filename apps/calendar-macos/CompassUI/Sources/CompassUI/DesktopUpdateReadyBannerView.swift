import CompassKit
import SwiftUI

public struct DesktopUpdateReadyBannerView: View {
    @Environment(\.nativeWebTheme) private var theme
    let onRestart: () -> Void

    public init(onRestart: @escaping () -> Void) {
        self.onRestart = onRestart
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("A Compass update is ready")
                .font(.rubik(14, weight: .medium))
                .foregroundStyle(theme.textColor)
            Button(action: onRestart) {
                HStack(spacing: 8) {
                    Text("Restart to update")
                    ShortcutHintChip(label: "Mod", style: .onAccent)
                    ShortcutHintChip(label: "R", style: .onAccent)
                }
            }
            .buttonStyle(CompactPrimaryButtonStyle())
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(width: 288, alignment: .leading)
        .background(theme.surfaceColor.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(theme.borderColor, lineWidth: 1))
        .shadow(color: theme.shadowDefaultColor, radius: 20, y: 10)
        .accessibilityIdentifier("compass-native-update-ready-banner")
    }
}
