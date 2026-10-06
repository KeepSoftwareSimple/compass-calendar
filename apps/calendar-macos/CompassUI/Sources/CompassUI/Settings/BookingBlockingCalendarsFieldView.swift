import CompassData
import CompassKit
import SwiftUI

struct BookingBlockingCalendarsFieldView: View {
    @Environment(\.nativeWebTheme) private var theme
    let availabilityCalendars: [CompassCalendar]
    let blockingCalendarIds: [String]
    let connections: [UserMetadataConnections]
    let onToggle: (String, Bool) -> Void

    private var blockingSet: Set<String> {
        Set(blockingCalendarIds)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Blocking calendars")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textColor)
            if availabilityCalendars.isEmpty {
                Text("No calendars available.")
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
            } else {
                groupedContent
            }
        }
        .accessibilityIdentifier("booking-blocking-calendars")
    }

    @ViewBuilder
    private var groupedContent: some View {
        let grouped = CalendarAccountGrouping.groupCalendarsByAccount(
            calendars: availabilityCalendars,
            connections: connections
        )
        let groupsWithCalendars = grouped.groups.filter { !$0.calendars.isEmpty }
        let showAccountCaption = groupsWithCalendars.count > 1
        ForEach(groupsWithCalendars, id: \.accountKey) { group in
            VStack(alignment: .leading, spacing: 6) {
                if showAccountCaption {
                    Text(group.accountLabel)
                        .font(.custom("Rubik", size: 11))
                        .foregroundStyle(theme.textMutedColor)
                }
                ForEach(group.calendars, id: \.id) { calendar in
                    blockingRow(calendar)
                }
            }
        }
        ForEach(grouped.ungrouped, id: \.id) { calendar in
            blockingRow(calendar)
        }
    }

    private func blockingRow(_ calendar: CompassCalendar) -> some View {
        Toggle(
            calendar.name,
            isOn: Binding(
                get: { blockingSet.contains(calendar.id) },
                set: { onToggle(calendar.id, $0) }
            )
        )
        .font(.custom("Rubik", size: 12))
    }
}
