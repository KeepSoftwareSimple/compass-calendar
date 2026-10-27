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
        VStack(alignment: .leading, spacing: 4) {
            SettingsFieldLabel("Default timezone")
            Button {
                settingsStore.openTimezoneDialog(.pin)
            } label: {
                Text(label).settingsSelectChrome()
            }
            .buttonStyle(.plain)
            .focusable()
            .accessibilityLabel("Default timezone: \(label)")
        }
        .accessibilityIdentifier("settings-section-timezone")
    }
}
