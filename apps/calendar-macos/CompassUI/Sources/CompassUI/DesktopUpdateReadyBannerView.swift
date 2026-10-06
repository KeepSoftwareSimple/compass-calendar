import SwiftUI

public struct DesktopUpdateReadyBannerView: View {
    @Environment(\.nativeWebTheme) private var theme
    let onRestart: () -> Void

    public init(onRestart: @escaping () -> Void) {
        self.onRestart = onRestart
    }

    public var body: some View {
        HStack(spacing: 12) {
            Text("A Compass update is ready")
                .font(.custom("Rubik", size: 14, relativeTo: .body))
                .fontWeight(.medium)
                .foregroundStyle(theme.textColor)
            Spacer(minLength: 8)
            Button("Restart to update", action: onRestart)
                .buttonStyle(.borderedProminent)
                .tint(theme.accentSecondaryColor)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(theme.surfacePanelColor)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(height: 1)
        }
        .accessibilityIdentifier("compass-native-update-ready-banner")
    }
}
