import CompassData
import SwiftUI

struct ShortcutLevelBadgeView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var levelsStore: LevelsStore
    let onOpenShortcuts: () -> Void

    var body: some View {
        if !levelsStore.badgeHidden {
            let level = levelsStore.levelSnapshot
            Button(action: onOpenShortcuts) {
                Text(levelsStore.badgeLabel)
                    .font(.rubik(12))
                    .foregroundStyle(theme.textMutedColor)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
                    .scaleEffect(levelsStore.badgePulsing ? 1.06 : 1)
                    .animation(.easeInOut(duration: 0.35), value: levelsStore.badgePulsing)
            }
            .buttonStyle(.plain)
            .help("Level \(level.level): \(level.name). \(level.used) of \(level.total) shortcuts used.")
            .accessibilityLabel("Shortcut level \(level.level), \(level.name). \(level.used) of \(level.total) shortcuts used. Open shortcuts.")
            .accessibilityIdentifier("compass-native-shortcut-level-badge")
        }
    }
}
