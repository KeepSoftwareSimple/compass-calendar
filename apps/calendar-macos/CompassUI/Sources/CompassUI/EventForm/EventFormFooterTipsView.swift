import CompassData
import CompassKit
import SwiftUI

/// Context-aware keyboard tips under the Save bar, matching web `EventFormFooterTips`.
struct EventFormFooterTipsView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    var tabNavigationApplies: Bool = true

    var body: some View {
        if !model.levelsStore.tipsMuted {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 4) {
                    if tabNavigationApplies { tabNavigation }
                    actions
                }
                VStack(spacing: 2) {
                    if tabNavigationApplies { tabNavigation }
                    actions
                }
            }
            .font(.rubik(11))
            .foregroundStyle(theme.textMutedColor)
            .frame(maxWidth: .infinity, minHeight: 40)
            .accessibilityIdentifier("compass-event-form-footer-tips")
        }
    }

    private var tabNavigation: some View {
        HStack(spacing: 4) {
            ShortcutHintChip(label: "Tab")
            Text("/")
            ShortcutHintChip(label: "Shift")
            ShortcutHintChip(label: "Tab")
            Text("between fields ·")
        }
        .fixedSize()
    }

    private var actions: some View {
        HStack(spacing: 4) {
            Text("Hold")
            ShortcutHintChip(label: KeycapGlyphs.display(["Mod"]))
            Text("then")
            ShortcutHintChip(label: "0")
            Text("for actions")
        }
        .fixedSize()
    }
}
