import CompassData
import CompassKit
import SwiftUI

struct SettingsThemeSectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var settingsStore: SettingsStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Theme")
                .font(.custom("Rubik", size: 15))
                .foregroundStyle(theme.textColor)
            Picker(
                "Theme",
                selection: Binding(
                    get: { settingsStore.theme },
                    set: { settingsStore.setTheme($0) })
            ) {
                Text("Light beach").tag(CompassThemeName.lightBeach)
                Text("Dark abyss").tag(CompassThemeName.darkAbyss)
            }
            .labelsHidden()
        }
        .accessibilityIdentifier("settings-section-theme")
    }
}
