import CompassData
import CompassKit
import SwiftUI

struct ShortcutSidebarFooter: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var levelsStore: LevelsStore
    var isEventFormVisible: Bool = false
    var isLifeView: Bool = false
    var suppressTips: Bool = false
    var suppressForQuickTime: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let toast = levelsStore.pendingLevelUpToast {
                Text(toast.title)
                    .font(.rubik(12))
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

            if !isEventFormVisible, !levelsStore.tipsMuted, !suppressTips, !suppressForQuickTime {
                idleShortcutTip
            }
        }
    }

    @ViewBuilder
    private var idleShortcutTip: some View {
        VStack(alignment: .center, spacing: 2) {
            if isLifeView {
                lifeThisWeekHint
            } else if let tip = levelsStore.currentTip, tip.shortcutId == "focus-shift-hold" {
                HStack(spacing: 4) {
                    Text("F shows event and open-time shortcuts")
                        .font(.rubik(11))
                        .foregroundStyle(theme.textMutedColor)
                    ShortcutHintChip(label: "F", celebrate: chipCelebrate)
                }
                .frame(maxWidth: .infinity)
            } else if let tip = levelsStore.currentTip, tip.shortcutId == "focus-page-jump" {
                pageJumpHint
            } else if levelsStore.currentTip == nil {
                pageJumpHint
            } else if let tip = levelsStore.currentTip {
                HStack(spacing: 4) {
                    Text(tip.label)
                        .font(.rubik(11))
                        .foregroundStyle(theme.textMutedColor)
                    ForEach(tip.keycaps, id: \.self) { key in
                        ShortcutHintChip(
                            label: KeycapGlyphs.display([key]),
                            celebrate: chipCelebrate)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityIdentifier("compass-native-shortcut-tip")
    }

    private var chipCelebrate: Bool {
        guard let pulseKey = levelsStore.hintShortcutChipPulseKey else { return false }
        if let tip = levelsStore.currentTip {
            return tip.shortcutId == pulseKey
        }
        return pulseKey == "focus-page-jump"
    }

    private var lifeThisWeekHint: some View {
        HStack(spacing: 4) {
            Text("Focus current week")
                .font(.rubik(11))
                .foregroundStyle(theme.textMutedColor)
            ShortcutHintChip(label: "T", celebrate: false)
        }
        .frame(maxWidth: .infinity)
    }

    private var pageJumpHint: some View {
        HStack(spacing: 4) {
            Text("Hold")
                .font(.rubik(11))
                .foregroundStyle(theme.textMutedColor)
            ShortcutHintChip(
                label: KeycapGlyphs.display(["Mod"]),
                celebrate: chipCelebrate)
            Text("to see jump targets")
                .font(.rubik(11))
                .foregroundStyle(theme.textMutedColor)
        }
        .frame(maxWidth: .infinity)
    }

}
