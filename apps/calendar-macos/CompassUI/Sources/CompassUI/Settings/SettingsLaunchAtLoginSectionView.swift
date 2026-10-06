import CompassData
import SwiftUI

struct SettingsLaunchAtLoginSectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var settingsStore: SettingsStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Launch at login")
                .font(.custom("Rubik", size: 15))
                .foregroundStyle(theme.textColor)
            Text("Open Compass automatically when you sign in to this Mac.")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            Toggle("Launch Compass at login", isOn: Binding(
                get: { settingsStore.launchAtLoginEnabled },
                set: { settingsStore.setLaunchAtLogin($0) }))
            .toggleStyle(.checkbox)
        }
        .accessibilityIdentifier("settings-section-launch-at-login")
    }
}
