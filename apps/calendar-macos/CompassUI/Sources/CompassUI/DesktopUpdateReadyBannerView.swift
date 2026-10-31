import CompassKit
import SwiftUI

public struct DesktopUpdateReadyBannerView: View {
    let onRestart: () -> Void
    let onDismiss: () -> Void

    public init(onRestart: @escaping () -> Void, onDismiss: @escaping () -> Void = {}) {
        self.onRestart = onRestart
        self.onDismiss = onDismiss
    }

    public var body: some View {
        BottomNoticeView(
            message: "Compass just got better. Refresh now.",
            onDismiss: onDismiss
        ) {
            Button(action: onRestart) {
                HStack(spacing: 4) {
                    Text("Refresh")
                    ShortcutHintChip(label: "Mod", style: .onAccent)
                    ShortcutHintChip(label: "R", style: .onAccent)
                }
            }
            .buttonStyle(NoticeCompactPrimaryButtonStyle())
        }
        .accessibilityIdentifier("compass-native-update-ready-banner")
    }
}
