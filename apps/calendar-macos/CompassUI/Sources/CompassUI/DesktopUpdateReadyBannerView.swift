import CompassKit
import SwiftUI

public struct DesktopUpdateReadyBannerView: View {
    @Environment(\.nativeWebTheme) private var theme
    let onRestart: () -> Void
    let onDismiss: () -> Void

    public init(onRestart: @escaping () -> Void, onDismiss: @escaping () -> Void = {}) {
        self.onRestart = onRestart
        self.onDismiss = onDismiss
    }

    public var body: some View {
        BottomNoticeView {
            Text("Compass just got better. Refresh to update.")
                .font(.rubik(NativeWebLayoutTokens.fontSizeXS))
                .foregroundStyle(theme.textMutedColor)
                .fixedSize(horizontal: false, vertical: true)
        } actions: {
            HStack(spacing: 6) {
                Button(action: onRestart) {
                    HStack(spacing: 6) {
                        Text("Refresh")
                        ShortcutHintChip(label: "Mod", style: .onAccent)
                        ShortcutHintChip(label: "R", style: .onAccent)
                    }
                }
                .buttonStyle(CompactPrimaryButtonStyle())
                NoticeDismissButton(action: onDismiss)
            }
        }
        .accessibilityIdentifier("compass-native-update-ready-banner")
    }
}
