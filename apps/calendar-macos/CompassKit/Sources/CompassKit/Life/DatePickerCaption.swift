import Foundation

/// Web `DatePicker` caption picker: the caption opens a year grid, then a month
/// grid, then returns to the day grid (`CAPTION_VIEW_AFTER_SELECT`).
public enum DatePickerCaption {
    public enum View: Sendable, Equatable {
        case day
        case year
        case month

        /// What a selection leads to; a day selection leads nowhere.
        public var afterSelect: View? {
            switch self {
            case .year: .month
            case .month: .day
            case .day: nil
            }
        }
    }

    /// Web `CAPTION_YEARS_PER_PAGE` / react-datepicker `yearItemNumber`.
    public static let yearsPerPage = 20

    /// react-datepicker alignment: 1–20, 21–40, … (1981–2000 for 1993).
    public static func reactYearPage(containing year: Int) -> [Int] {
        let block = (year - 1) / yearsPerPage
        let start = block * yearsPerPage + 1
        return (start ..< start + yearsPerPage).map { $0 }
    }

    public static let monthLabels = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]

    /// Web caption text: the month and year, or the prompt for the open grid.
    public static func yearRangeCaption(pageAnchorYear: Int) -> String {
        reactYearRangeCaption(containing: pageAnchorYear)
    }

    public static func reactYearRangeCaption(containing year: Int) -> String {
        let years = reactYearPage(containing: year)
        guard let first = years.first, let last = years.last else { return "Select year" }
        if first == last { return "Year \(first)" }
        return "Years \(first) to \(last)"
    }

    public static func caption(view: View, monthTitle: String, year: Int) -> String {
        switch view {
        case .day: monthTitle
        case .year: reactYearRangeCaption(containing: year)
        case .month: "Select month, \(year)"
        }
    }

    public static func isYearAllowed(_ year: Int, minimum: Date?, maximum: Date?, calendar: Calendar) -> Bool {
        if let minimum, year < calendar.component(.year, from: minimum) { return false }
        if let maximum, year > calendar.component(.year, from: maximum) { return false }
        return true
    }

    public static func isMonthAllowed(year: Int, month: Int, minimum: Date?, maximum: Date?, calendar: Calendar) -> Bool {
        let key = year * 12 + (month - 1)
        if let minimum {
            let min = calendar.component(.year, from: minimum) * 12 + calendar.component(.month, from: minimum) - 1
            if key < min { return false }
        }
        if let maximum {
            let max = calendar.component(.year, from: maximum) * 12 + calendar.component(.month, from: maximum) - 1
            if key > max { return false }
        }
        return true
    }

    public static func isDayAllowed(_ day: Date, minimum: Date?, maximum: Date?, calendar: Calendar) -> Bool {
        let start = calendar.startOfDay(for: day)
        if let minimum, start < calendar.startOfDay(for: minimum) { return false }
        if let maximum, start > calendar.startOfDay(for: maximum) { return false }
        return true
    }
}
