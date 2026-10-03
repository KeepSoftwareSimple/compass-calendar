import Foundation

public struct TimeGridState: Sendable {
    public var layoutMode: GridLayoutMode
    public var referenceNow: Date
    public var scenario: GridLayoutScenario
    public var trackWidth: CGFloat
    public var hasSecondaryTimeZone: Bool
    public var effectiveTimeZone: String
    public var timeTravelTimeZone: String?

    public init(
        layoutMode: GridLayoutMode = .week,
        referenceNow: Date = GridLayoutSnapshotFixtures.referenceNow,
        scenario: GridLayoutScenario,
        trackWidth: CGFloat = 1010,
        hasSecondaryTimeZone: Bool = false,
        effectiveTimeZone: String = EffectiveTimeZone.identifier,
        timeTravelTimeZone: String? = nil
    ) {
        self.layoutMode = layoutMode
        self.referenceNow = referenceNow
        self.scenario = scenario
        self.trackWidth = trackWidth
        self.hasSecondaryTimeZone = hasSecondaryTimeZone
        self.effectiveTimeZone = effectiveTimeZone
        self.timeTravelTimeZone = timeTravelTimeZone
    }

    public func snapshot(colWidths: [Double]) -> GridLayoutSnapshot {
        GridLayoutSnapshotBuilder.build(
            scenario: scenario,
            colWidths: colWidths,
            hasSecondaryTimeZone: hasSecondaryTimeZone)
    }

    public func resolvedColumnWidths() -> [Double] {
        let marginLeft = GridMetrics.gridMarginLeftPx(hasSecondaryTimeZone: hasSecondaryTimeZone)
        let count = max(1, scenario.visibleDateKeys.count)
        if scenario.layoutMode == .day {
            let calendars = DayCalendarColumns.dayViewCalendars(scenario.calendars)
            let columnCount = max(calendars.count, 1)
            let usable = Double(trackWidth) - marginLeft
            let width = max(usable / Double(columnCount), Double(GridMetrics.dayColumnMinUsableWidth))
            return Array(repeating: width, count: columnCount)
        }
        let usable = Double(trackWidth) - marginLeft
        let width = max(usable / Double(count), Double(GridMetrics.dayColumnMinUsableWidth))
        return Array(repeating: width, count: count)
    }
}
