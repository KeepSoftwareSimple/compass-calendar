import Foundation

public enum GridTimeConstants {
    public static let timedVisibleHours = 13
    public static let gridPaddingBottom = 20.0
    /// Weekday header row above the all-day strip. AppKit layout, chip Y, and
    /// demo scroll all add this before timed-content document Y.
    public static let dayHeaderRowHeight = 28.0

    public static func timedContentDocumentYOffset(allDayRowHeight: Double) -> Double {
        dayHeaderRowHeight + allDayRowHeight
    }
}
