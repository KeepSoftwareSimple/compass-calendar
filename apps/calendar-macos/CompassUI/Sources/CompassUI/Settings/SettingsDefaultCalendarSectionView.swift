import CompassData
import CompassKit
import SwiftUI

struct SettingsDefaultCalendarSectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var settingsStore: SettingsStore
    let calendars: [CompassCalendar]
    let hasConnectedAccount: Bool

    private var writable: [CompassCalendar] {
        DefaultCalendarResolver.writableCalendars(calendars, hasConnectedAccount: hasConnectedAccount)
    }

    private var resolvedDefault: CompassCalendar? {
        DefaultCalendarResolver.resolvedDefault(
            calendars: calendars,
            storedId: settingsStore.defaultCalendarId,
            hasConnectedAccount: hasConnectedAccount)
    }

    var body: some View {
        if writable.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("Default Calendar")
                    .font(.custom("Rubik", size: 15))
                    .foregroundStyle(theme.textColor)
                Picker(
                    "Default Calendar",
                    selection: Binding(
                        get: { settingsStore.defaultCalendarId ?? resolvedDefault?.id ?? "" },
                        set: { settingsStore.setDefaultCalendarId($0.isEmpty ? nil : $0) })
                ) {
                    ForEach(writable, id: \.id) { calendar in
                        Text(calendar.name).tag(calendar.id)
                    }
                }
                .labelsHidden()
            }
            .accessibilityIdentifier("settings-section-default-calendar")
        }
    }
}
