import CompassData
import CompassKit
import SwiftUI

struct BookingWeeklyHoursEditorView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Binding var value: [BookingPageWeeklyAvailability]
    let disabled: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(WeekdayEnum.allCases, id: \.rawValue) { weekday in
                dayRow(weekday)
            }
        }
    }

    private func dayRow(_ weekday: WeekdayEnum) -> some View {
        let intervals = BookingWeeklyHours.intervalsForDay(value, weekday: weekday)
        let available = !intervals.isEmpty
        return VStack(alignment: .leading, spacing: 4) {
            Toggle(isOn: Binding(
                get: { available },
                set: { value = BookingWeeklyHours.setDayAvailable(value, weekday: weekday, available: $0) }
            )) {
                Text(weekdayLabel(weekday))
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textColor)
            }
            .disabled(disabled)
            if let block = intervals.first {
                HStack(spacing: 8) {
                    timePicker(
                        selection: block.start,
                        weekday: weekday,
                        index: 0,
                        kind: .start
                    )
                    Text("to")
                        .foregroundStyle(theme.textMutedColor)
                    timePicker(
                        selection: block.end,
                        weekday: weekday,
                        index: 0,
                        kind: .end
                    )
                }
            }
        }
    }

    private enum TimeKind { case start, end }

    private func timePicker(
        selection: String,
        weekday: WeekdayEnum,
        index: Int,
        kind: TimeKind
    ) -> some View {
        Picker("", selection: Binding(
            get: { selection },
            set: { newValue in
                switch kind {
                case .start:
                    value = BookingWeeklyHours.updateBlock(
                        value,
                        weekday: weekday,
                        index: index,
                        start: newValue
                    )
                case .end:
                    value = BookingWeeklyHours.updateBlock(
                        value,
                        weekday: weekday,
                        index: index,
                        end: newValue
                    )
                }
            }
        )) {
            ForEach(BookingWeeklyHours.timeOptions, id: \.self) { option in
                Text(option).tag(option)
            }
        }
        .labelsHidden()
        .frame(width: 88)
        .disabled(disabled)
    }

    private func weekdayLabel(_ weekday: WeekdayEnum) -> String {
        switch weekday {
        case .v1: "Monday"
        case .v2: "Tuesday"
        case .v3: "Wednesday"
        case .v4: "Thursday"
        case .v5: "Friday"
        case .v6: "Saturday"
        case .v7: "Sunday"
        }
    }
}
