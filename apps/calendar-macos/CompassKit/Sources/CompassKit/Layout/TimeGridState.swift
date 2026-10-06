import Foundation

public struct TimeGridState: Sendable {
    public var layoutMode: GridLayoutMode
    public var referenceNow: Date
    public var scenario: GridLayoutScenario
    public var trackWidth: CGFloat
    public var focusedEventId: String?
    /// Grid card whose event is open in the sidebar form (keyboard focus may be elsewhere).
    public var sidebarEditingEventId: String?
    public var eventJumpHints: [EventJumpChipHint]

    public init(
        layoutMode: GridLayoutMode = .week,
        referenceNow: Date = GridLayoutSnapshotFixtures.referenceNow,
        scenario: GridLayoutScenario,
        trackWidth: CGFloat = 1010,
        focusedEventId: String? = nil,
        sidebarEditingEventId: String? = nil,
        eventJumpHints: [EventJumpChipHint] = []
    ) {
        self.layoutMode = layoutMode
        self.referenceNow = referenceNow
        self.scenario = scenario
        self.trackWidth = trackWidth
        self.focusedEventId = focusedEventId
        self.sidebarEditingEventId = sidebarEditingEventId
        self.eventJumpHints = eventJumpHints
    }

    public func snapshot(colWidths: [Double]) -> GridLayoutSnapshot {
        GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: colWidths)
    }

    public func resolvedColumnWidths() -> [Double] {
        let count = max(1, scenario.visibleDateKeys.count)
        if scenario.layoutMode == .day {
            let calendars = DayCalendarColumns.dayViewCalendars(scenario.calendars)
            let columnCount = max(calendars.count, 1)
            let usable = Double(trackWidth) - GridMetrics.gridMarginLeft
            let width = max(usable / Double(columnCount), Double(GridMetrics.dayColumnMinUsableWidth))
            return Array(repeating: width, count: columnCount)
        }
        let usable = Double(trackWidth) - GridMetrics.gridMarginLeft
        let width = max(usable / Double(count), Double(GridMetrics.dayColumnMinUsableWidth))
        return Array(repeating: width, count: count)
    }
}
