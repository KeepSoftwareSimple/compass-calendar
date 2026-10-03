import CompassKit
import SwiftUI

public struct SidebarMonthPicker: View {
    @Environment(\.nativeWebTheme) private var theme
    @Binding public var displayedMonth: Date
    public let selectedDate: Date
    public let onSelectDate: (Date) -> Void
    private let trailingHeader: AnyView?

    public init(
        displayedMonth: Binding<Date>,
        selectedDate: Date,
        onSelectDate: @escaping (Date) -> Void,
        trailingHeader: (() -> some View)? = nil
    ) {
        _displayedMonth = displayedMonth
        self.selectedDate = selectedDate
        self.onSelectDate = onSelectDate
        if let trailingHeader {
            self.trailingHeader = AnyView(trailingHeader())
        } else {
            self.trailingHeader = nil
        }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(monthTitle)
                    .font(.custom("Rubik", size: 13, relativeTo: .headline))
                    .foregroundStyle(theme.textColor)
                Spacer()
                if let trailingHeader {
                    trailingHeader
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(dayCells, id: \.self) { day in
                    if let day {
                        Button {
                            onSelectDate(day)
                        } label: {
                            Text(dayNumber(day))
                                .font(.custom("Rubik", size: 12))
                                .frame(maxWidth: .infinity, minHeight: 24)
                                .foregroundStyle(theme.textColor)
                                .background(
                                    isSameDay(day, selectedDate)
                                        ? theme.textMutedColor.opacity(0.35)
                                        : Color.clear
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(dayAccessibilityLabel(day))
                    } else {
                        Color.clear.frame(minHeight: 24)
                    }
                }
            }
        }
        .accessibilityIdentifier("compass-native-month-picker")
    }

    private var monthTitle: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = EffectiveTimeZone.timeZone
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: displayedMonth)
    }

    private var dayCells: [Date?] {
        let calendar = EffectiveTimeZone.calendar
        guard let monthInterval = calendar.dateInterval(of: .month, for: displayedMonth),
              let firstWeek = calendar.dateInterval(of: .weekOfYear, for: monthInterval.start)
        else {
            return []
        }
        var days: [Date?] = []
        var cursor = firstWeek.start
        while cursor < monthInterval.end || days.count % 7 != 0 {
            if cursor >= monthInterval.start, cursor < monthInterval.end {
                days.append(cursor)
            } else if days.count < 42 {
                days.append(nil)
            }
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
            if days.count >= 42 { break }
        }
        return days
    }

    private func dayNumber(_ date: Date) -> String {
        String(EffectiveTimeZone.calendar.component(.day, from: date))
    }

    private func isSameDay(_ lhs: Date, _ rhs: Date) -> Bool {
        EffectiveTimeZone.calendar.isDate(lhs, inSameDayAs: rhs)
    }

    private func dayAccessibilityLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = EffectiveTimeZone.timeZone
        formatter.dateStyle = .full
        return formatter.string(from: date)
    }
}
