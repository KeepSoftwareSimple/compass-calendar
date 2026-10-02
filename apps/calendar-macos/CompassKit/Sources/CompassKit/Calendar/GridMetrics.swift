import Foundation

public struct GridMeasurement: Hashable, Sendable, Codable {
    public var bottom: Double
    public var height: Double
    public var left: Double
    public var right: Double
    public var top: Double
    public var width: Double
    public var x: Double
    public var y: Double

    public init(
        bottom: Double,
        height: Double,
        left: Double,
        right: Double,
        top: Double,
        width: Double,
        x: Double,
        y: Double
    ) {
        self.bottom = bottom
        self.height = height
        self.left = left
        self.right = right
        self.top = top
        self.width = width
        self.x = x
        self.y = y
    }
}

/// Measured grid geometry: column widths, hour height, and optional DOM rects.
public struct GridMetrics: Hashable, Sendable, Codable {
    public var allDayRow: GridMeasurement?
    public var colWidths: [Double]
    public var hourHeight: Double
    public var mainGrid: GridMeasurement?

    public init(
        allDayRow: GridMeasurement? = nil,
        colWidths: [Double],
        hourHeight: Double,
        mainGrid: GridMeasurement? = nil
    ) {
        self.allDayRow = allDayRow
        self.colWidths = colWidths
        self.hourHeight = hourHeight
        self.mainGrid = mainGrid
    }

    public static let gridTimeColumnWidth = 50.0
    public static let gridMarginLeft = gridTimeColumnWidth
    public static let dayColumnMinUsableWidth = 140.0

    public static func gridMarginLeftPx(hasSecondaryTimeZone: Bool = false) -> Double {
        hasSecondaryTimeZone ? gridTimeColumnWidth * 2 : gridTimeColumnWidth
    }

    public static func sumWidthsBefore(_ widths: [Double], dateIndex: Int) -> Double {
        let end = max(0, min(dateIndex, widths.count))
        return widths.prefix(end).reduce(0, +)
    }

    public static func sumWidthsBetween(
        _ widths: [Double],
        startIndex: Int,
        endIndex: Int
    ) -> Double {
        guard endIndex >= startIndex else { return 0 }
        let slice = widths[startIndex ... endIndex]
        return slice.reduce(0, +)
    }
}
