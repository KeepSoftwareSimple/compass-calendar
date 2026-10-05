import CompassData
import CompassKit
import SwiftUI

struct SettingsTimezoneSectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var settingsStore: SettingsStore
    @Bindable var viewStore: ViewStore

    private var label: String {
        let effective = viewStore.effectiveTimeZone
        let abbrev = TimeZoneFormatting.abbreviation(for: effective)
        if viewStore.pinnedTimeZone == nil {
            return "Auto (\(abbrev))"
        }
        return "\(TimeZoneFormatting.cityName(for: effective)) (\(abbrev))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Default timezone")
                .font(.custom("Rubik", size: 15))
                .foregroundStyle(theme.textColor)
            Button(label) {
                settingsStore.openTimezoneDialog(.pin)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(theme.surfacePanelColor)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.borderColor))
            .foregroundStyle(theme.textColor)
            .font(.custom("Rubik", size: 13))
        }
        .accessibilityIdentifier("settings-section-timezone")
    }
}
