import CompassData
import CompassKit
import SwiftUI

struct TimezonePickerDialogView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var settingsStore: SettingsStore
    @Bindable var viewStore: ViewStore
    @State private var query = ""

    private var purpose: TimezoneDialogPurpose {
        settingsStore.timezoneDialogPurpose ?? .pin
    }

    private var title: String {
        purpose == .timeTravel ? "Second timezone" : "Change default timezone"
    }

    private var filteredResults: [TimezonePickerResult] {
        let all = TimeZone.knownTimeZoneIdentifiers.sorted()
        return CityTimezoneSearch.filterZones(query: query, zones: all, limit: 40)
    }

    var body: some View {
        ZStack {
            theme.panelBackdropColor
                .ignoresSafeArea()
                .onTapGesture { settingsStore.dismissTimezoneDialog() }
            VStack(alignment: .leading, spacing: 12) {
                // Web `TimezonePickerDialog`: title and message only; Esc or
                // the backdrop dismisses.
                ModalDialogTitle(title)
                if purpose == .timeTravel {
                    ModalDialogMessage("Compare your calendar hours in a second timezone.")
                }
                TextField("Search city, region, or abbreviation", text: $query)
                    .textFieldStyle(.roundedBorder)
                if purpose == .pin {
                    timezoneRow(label: "Use browser timezone (Auto)", value: nil)
                }
                if purpose == .timeTravel, viewStore.timeTravelTimeZone != nil {
                    timezoneRow(label: "Hide second timezone", value: nil, clearsTravel: true)
                }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(filteredResults, id: \.listKey) { result in
                            if purpose != .timeTravel || result.iana != viewStore.effectiveTimeZone {
                                timezoneRow(
                                    label: result.title,
                                    detail: result.subtitle,
                                    value: result.iana)
                            }
                        }
                    }
                }
                .frame(height: 240)
            }
            .padding(OverlayPanelChrome.padding)
            .frame(width: 480)
            .overlayPanelChrome()
        }
        .accessibilityIdentifier("compass-native-timezone-dialog")
    }

    @ViewBuilder
    private func timezoneRow(
        label: String,
        detail: String? = nil,
        value: String?,
        clearsTravel: Bool = false
    ) -> some View {
        Button {
            if purpose == .timeTravel {
                if clearsTravel {
                    settingsStore.setTimeTravelTimeZone(nil)
                } else if let value {
                    settingsStore.setTimeTravelTimeZone(value)
                }
            } else {
                settingsStore.setPinnedTimeZone(value)
            }
            settingsStore.dismissTimezoneDialog()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .foregroundStyle(theme.textColor)
                    .font(.rubik(13))
                if let detail {
                    Text(detail)
                        .foregroundStyle(theme.textMutedColor)
                        .font(.rubik(11))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }
}
