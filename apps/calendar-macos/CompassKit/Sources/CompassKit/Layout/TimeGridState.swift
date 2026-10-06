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
    public var focusedDayColumnCalendarId: String?
    public var pageJumpHintsVisible: Bool
    public var pageJumpDigitByCalendarId: [String: String]
    public var hasSecondaryTimeZone: Bool
    public var effectiveTimeZone: String
    public var timeTravelTimeZone: String?

    public init(
        layoutMode: GridLayoutMode = .week,
        referenceNow: Date = GridLayoutSnapshotFixtures.referenceNow,
        scenario: GridLayoutScenario,
        trackWidth: CGFloat = 1010,
        focusedEventId: String? = nil,
        sidebarEditingEventId: String? = nil,
        eventJumpHints: [EventJumpChipHint] = [],
        focusedDayColumnCalendarId: String? = nil,
        pageJumpHintsVisible: Bool = false,
        pageJumpDigitByCalendarId: [String: String] = [:],
        hasSecondaryTimeZone: Bool = false,
        effectiveTimeZone: String = EffectiveTimeZone.identifier,
        timeTravelTimeZone: String? = nil
    ) {
        self.layoutMode = layoutMode
        self.referenceNow = referenceNow
        self.scenario = scenario
        self.trackWidth = trackWidth
        self.focusedEventId = focusedEventId
        self.sidebarEditingEventId = sidebarEditingEventId
        self.eventJumpHints = eventJumpHints
        self.focusedDayColumnCalendarId = focusedDayColumnCalendarId
        self.pageJumpHintsVisible = pageJumpHintsVisible
        self.pageJumpDigitByCalendarId = pageJumpDigitByCalendarId
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
            let width = max(
                usable / Double(columnCount),
                Double(GridMetrics.eventWidthMinimum)
            )
            return Array(repeating: width, count: columnCount)
        }
        let usable = Double(trackWidth) - marginLeft
        let width = max(usable / Double(count), Double(GridMetrics.dayColumnMinUsableWidth))
        return Array(repeating: width, count: count)
    }

    public func documentContentWidth() -> CGFloat {
        let marginLeft = GridMetrics.gridMarginLeftPx(hasSecondaryTimeZone: hasSecondaryTimeZone)
        let columns = resolvedColumnWidths()
        return CGFloat(marginLeft + columns.reduce(0, +))
    }
}
