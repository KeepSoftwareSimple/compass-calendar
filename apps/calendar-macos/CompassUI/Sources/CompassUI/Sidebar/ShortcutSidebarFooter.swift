import CompassData
import SwiftUI

struct ShortcutSidebarFooter: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var levelsStore: LevelsStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let toast = levelsStore.pendingLevelUpToast {
                Text(toast.title)
                    .font(.custom("Rubik", size: 12, relativeTo: .caption))
                    .foregroundStyle(theme.textColor)
                    .padding(8)
                    .background(theme.surfaceColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                            levelsStore.consumeLevelUpToast()
                        }
                    }
            }

            if !levelsStore.badgeHidden {
                HStack(spacing: 8) {
                    Text(levelsStore.badgeLabel)
                        .font(.custom("Rubik", size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.textColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(theme.surfaceColor)
                        .clipShape(Capsule())
                        .scaleEffect(levelsStore.badgePulsing ? 1.06 : 1)
                        .animation(.easeInOut(duration: 0.35), value: levelsStore.badgePulsing)
                        .accessibilityIdentifier("compass-native-shortcut-level-badge")

                    if let tip = levelsStore.currentTip {
                        Text("Try \(tip.label)")
                            .font(.custom("Rubik", size: 11, relativeTo: .caption))
                            .foregroundStyle(theme.textMutedColor)
                            .lineLimit(2)
                            .accessibilityIdentifier("compass-native-shortcut-tip")
                    }
                }
            }
        }
    }
}
