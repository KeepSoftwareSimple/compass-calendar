import Foundation

public enum GridLayoutSnapshotBuilder {
    public static func build(
        scenario: GridLayoutScenario,
        colWidths: [Double],
        hourHeight: Double = 60,
        allDayRowsCount: Int? = nil,
        hasSecondaryTimeZone: Bool = false
    ) -> GridLayoutSnapshot {
        let visibleDates = GridVisibleDate.fromKeys(scenario.visibleDateKeys)
        let marginLeft = GridMetrics.gridMarginLeftPx(hasSecondaryTimeZone: hasSecondaryTimeZone)
        let timedGridHeight = Double(GridTimeConstants.timedVisibleHours) * hourHeight
        let lookup = CalendarLookupBuilder.build(scenario.calendars)

        let resolvedColumns = resolveColumns(
            scenario: scenario,
            visibleDates: visibleDates,
            colWidths: colWidths,
            marginLeft: marginLeft
        )

        let measurements = GridMetrics(
            colWidths: colWidths,
            hourHeight: hourHeight,
            mainGrid: GridMeasurement(
                bottom: timedGridHeight,
                height: timedGridHeight,
                left: 0,
                right: colWidths.reduce(0, +) + marginLeft,
                top: 0,
                width: colWidths.reduce(0, +) + marginLeft,
                x: 0,
                y: 0
            )
        )

        let allDayAssignment = AssignEventsToRow.assign(
            allDayEvents: scenario.allDayEvents.map {
                GridEventRowInput(
                    id: $0.eventId,
                    startDate: $0.startDate,
                    endDate: $0.endDate,
                    row: $0.row,
                    title: $0.title
                )
            }
        )
        let allDayRowHeight = allDayRowHeightPx(rowsCount: allDayRowsCount ?? allDayAssignment.rowsCount)

        var cards: [GridLayoutCardSnapshot] = []

        for event in allDayAssignment.allDayEvents {
            guard let input = scenario.allDayEvents.first(where: { $0.eventId == event.id }) else {
                continue
            }
            let columnIndex = columnIndexForEvent(
                calendarId: input.calendarId,
                scenario: scenario,
                visibleDates: visibleDates,
                startDate: input.startDate
            )
            let position = EventPositionCalculator.getAllDayEventPosition(
                startDate: event.startDate,
                endDate: event.endDate,
                row: event.row,
                measurements: measurements,
                visibleDates: visibleDates,
                columnIndex: scenario.layoutMode == .day ? columnIndex : nil
            )
            cards.append(
                makeCard(
                    eventId: event.id,
                    kind: .allDay,
                    label: event.title,
                    frame: position,
                    zIndex: 1,
                    lookup: lookup,
                    calendarId: input.calendarId,
                    colorHex: input.colorHex,
                    isHidden: false
                )
            )
        }

        let deckInputs = scenario.timedEvents.map {
            TimedDeckEventInput(id: $0.eventId, startDate: $0.startDate, endDate: $0.endDate)
        }
        let deckLayout = TimedDeckLayoutEngine.createTimedEventLayout(
            events: deckInputs,
            hiddenEventIds: scenario.hiddenEventIds
        )
        let deckById = Dictionary(uniqueKeysWithValues: deckLayout.map { ($0.eventId, $0) })

        for timed in scenario.timedEvents {
            guard let deckItem = deckById[timed.eventId] else { continue }
            let columnIndex = columnIndexForEvent(
                calendarId: timed.calendarId,
                scenario: scenario,
                visibleDates: visibleDates,
                startDate: timed.startDate
            )
            let base = EventPositionCalculator.getTimedEventPosition(
                EventPositionCalculator.TimedEventInput(
                    startDate: timed.startDate,
                    endDate: timed.endDate
                ),
                measurements: measurements,
                visibleDates: visibleDates,
                columnIndex: scenario.layoutMode == .day ? columnIndex : nil
            )
            let display = TimedDeckLayoutEngine.applyTimedEventDisplayPosition(
                base,
                deckLayout: deckItem.deckLayout,
                isHidden: deckItem.isHidden
            )
            cards.append(
                makeCard(
                    eventId: timed.eventId,
                    kind: .timed,
                    label: timed.title,
                    frame: display,
                    zIndex: display.zIndex ?? 1,
                    lookup: lookup,
                    calendarId: timed.calendarId,
                    colorHex: timed.colorHex,
                    isHidden: deckItem.isHidden
                )
            )
        }

        let busySegments = BusyPeriodLayout.splitBusyPeriodsByDay(
            busyPeriods: scenario.busyPeriods,
            visibleDates: visibleDates
        )
        for segment in busySegments {
            let columnIndex = columnIndexForCalendarId(
                segment.calendarId,
                scenario: scenario,
                visibleDates: visibleDates
            )
            let position = EventPositionCalculator.getBusyPeriodPosition(
                segmentStart: segment.start,
                segmentEnd: segment.end,
                measurements: measurements,
                visibleDates: visibleDates,
                columnIndex: scenario.layoutMode == .day ? columnIndex : nil
            )
            cards.append(
                GridLayoutCardSnapshot(
                    accessibilityIdentifier: GridLayoutAccessibility.eventIdentifier(
                        eventId: segment.key
                    ),
                    eventId: segment.key,
                    fillColorHex: GridEventCardChrome.resolveCalendarFocusColor(
                        lookup: lookup,
                        calendarId: segment.calendarId
                    ),
                    frame: position,
                    isHiddenStrip: false,
                    kind: .busy,
                    label: "Busy",
                    zIndex: 0
                )
            )
        }

        if let draft = scenario.draftOverlay {
            cards.append(
                draftCard(
                    draft: draft,
                    scenario: scenario,
                    measurements: measurements,
                    visibleDates: visibleDates,
                    lookup: lookup
                )
            )
        }

        cards.sort { lhs, rhs in
            if lhs.zIndex != rhs.zIndex { return lhs.zIndex < rhs.zIndex }
            return lhs.eventId < rhs.eventId
        }

        let nowLine = nowLineSnapshot(
            referenceNow: scenario.referenceNow,
            visibleDates: visibleDates,
            hourHeight: hourHeight,
            marginLeft: marginLeft,
            colWidths: colWidths
        )

        return GridLayoutSnapshot(
            cards: cards,
            columns: resolvedColumns,
            layoutMode: scenario.layoutMode,
            metrics: GridLayoutSnapshotMetrics(
                allDayRowHeight: allDayRowHeight,
                colWidths: colWidths,
                hourHeight: hourHeight,
                marginLeft: marginLeft,
                timedGridHeight: timedGridHeight
            ),
            nowLine: nowLine,
            visibleDayCount: visibleDates.count
        )
    }

    private static func resolveColumns(
        scenario: GridLayoutScenario,
        visibleDates: [GridVisibleDate],
        colWidths: [Double],
        marginLeft: Double
    ) -> [GridLayoutColumnSnapshot] {
        switch scenario.layoutMode {
        case .week:
            return visibleDates.enumerated().map { index, visible in
                let left = marginLeft + GridMetrics.sumWidthsBefore(colWidths, dateIndex: index)
                let width = colWidths.indices.contains(index) ? colWidths[index] : 0
                return GridLayoutColumnSnapshot(
                    accessibilityIdentifier: GridLayoutAccessibility.columnIdentifier(
                        key: visible.key
                    ),
                    key: visible.key,
                    left: left,
                    width: width
                )
            }
        case .day:
            let dayCalendars = DayCalendarColumns.dayViewCalendars(scenario.calendars)
            if dayCalendars.isEmpty, let visible = visibleDates.first {
                return [
                    GridLayoutColumnSnapshot(
                        accessibilityIdentifier: GridLayoutAccessibility.columnIdentifier(
                            key: visible.key
                        ),
                        key: visible.key,
                        left: marginLeft,
                        width: colWidths.first ?? 0
                    ),
                ]
            }
            return dayCalendars.enumerated().map { index, calendar in
                let left = marginLeft + GridMetrics.sumWidthsBefore(colWidths, dateIndex: index)
                let width = colWidths.indices.contains(index) ? colWidths[index] : 0
                return GridLayoutColumnSnapshot(
                    accessibilityIdentifier: GridLayoutAccessibility.columnIdentifier(
                        key: calendar.id
                    ),
                    key: calendar.id,
                    left: left,
                    width: width
                )
            }
        }
    }

    private static func columnIndexForEvent(
        calendarId: String?,
        scenario: GridLayoutScenario,
        visibleDates: [GridVisibleDate],
        startDate: String
    ) -> Int? {
        switch scenario.layoutMode {
        case .day:
            guard let calendarId else {
                return visibleDates.isEmpty ? nil : 0
            }
            return columnIndexForCalendarId(calendarId, scenario: scenario, visibleDates: visibleDates)
        case .week:
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(startDate) else {
                return nil
            }
            let dayKey = CompassDateParsing.formatCalendarDay(start)
            return visibleDates.firstIndex(where: { $0.key == dayKey })
        }
    }

    private static func columnIndexForCalendarId(
        _ calendarId: String,
        scenario: GridLayoutScenario,
        visibleDates: [GridVisibleDate]
    ) -> Int? {
        let dayCalendars = DayCalendarColumns.dayViewCalendars(scenario.calendars)
        if let index = dayCalendars.firstIndex(where: { $0.id == calendarId }) {
            return index
        }
        return visibleDates.isEmpty ? nil : 0
    }

    private static func makeCard(
        eventId: String,
        kind: GridLayoutCardKind,
        label: String,
        frame: EventPosition,
        zIndex: Int,
        lookup: CalendarLookup,
        calendarId: String?,
        colorHex: String?,
        isHidden: Bool
    ) -> GridLayoutCardSnapshot {
        GridLayoutCardSnapshot(
            accessibilityIdentifier: GridLayoutAccessibility.eventIdentifier(eventId: eventId),
            eventId: eventId,
            fillColorHex: GridEventCardChrome.cardFillColorHex(
                lookup: lookup,
                calendarId: calendarId,
                eventColorHex: colorHex
            ),
            frame: frame,
            isHiddenStrip: isHidden,
            kind: kind,
            label: label,
            zIndex: zIndex
        )
    }

    private static func draftCard(
        draft: GridLayoutDraftOverlay,
        scenario: GridLayoutScenario,
        measurements: GridMetrics,
        visibleDates: [GridVisibleDate],
        lookup: CalendarLookup
    ) -> GridLayoutCardSnapshot {
        let allDayDraft = AllDayDraftSchedule(
            kind: draft.schedule.kind == .allDay ? .allDay : .timed,
            start: draft.schedule.start,
            end: draft.schedule.end
        )
        let displayTitle = draft.title.isEmpty ? "Untitled event" : draft.title

        if AllDayDraftPosition.isDraftRenderedInAllDayRow(allDayDraft) {
            let existingEvents = scenario.allDayEvents.map {
                AllDayDraftEvent(
                    id: $0.eventId,
                    startDate: $0.startDate,
                    endDate: $0.endDate,
                    row: $0.row,
                    title: $0.title,
                    isAllDay: true
                )
            }
            let positioned = AllDayDraftPosition.positionAllDayDraftEvent(
                draftId: draft.eventId,
                draft: allDayDraft,
                title: displayTitle,
                events: existingEvents
            )
            let active = positioned.activeDraftEvent ?? AllDayDraftPosition.draftToAllDayRowGridEvent(
                id: draft.eventId,
                title: displayTitle,
                draft: allDayDraft
            )
            let position = EventPositionCalculator.getAllDayEventPosition(
                startDate: active.startDate,
                endDate: active.endDate,
                row: active.row ?? 0,
                measurements: measurements,
                visibleDates: visibleDates,
                columnIndex: nil
            )
            return GridLayoutCardSnapshot(
                accessibilityIdentifier: GridLayoutAccessibility.eventIdentifier(eventId: draft.eventId),
                eventId: draft.eventId,
                fillColorHex: GridEventCardChrome.cardFillColorHex(
                    lookup: lookup,
                    calendarId: draft.calendarId,
                    eventColorHex: draft.colorHex
                ),
                frame: position,
                isHiddenStrip: false,
                kind: .allDay,
                label: displayTitle,
                zIndex: 10_000,
                isDraft: true,
                showsInlineTitleEditor: draft.showsInlineTitleEditor
            )
        }

        let startISO = CompassDateParsing.formatLikeDayjs(draft.schedule.start)
        let endISO = CompassDateParsing.formatLikeDayjs(draft.schedule.end)
        let columnIndex = columnIndexForEvent(
            calendarId: draft.calendarId,
            scenario: scenario,
            visibleDates: visibleDates,
            startDate: startISO
        )
        let position = EventPositionCalculator.getTimedEventPosition(
            EventPositionCalculator.TimedEventInput(
                startDate: startISO,
                endDate: endISO,
                isDraft: true
            ),
            measurements: measurements,
            visibleDates: visibleDates,
            columnIndex: scenario.layoutMode == .day ? columnIndex : nil
        )
        var floated = position
        floated.zIndex = 10_000

        return GridLayoutCardSnapshot(
            accessibilityIdentifier: GridLayoutAccessibility.eventIdentifier(eventId: draft.eventId),
            eventId: draft.eventId,
            fillColorHex: GridEventCardChrome.cardFillColorHex(
                lookup: lookup,
                calendarId: draft.calendarId,
                eventColorHex: draft.colorHex
            ),
            frame: floated,
            isHiddenStrip: false,
            kind: .timed,
            label: displayTitle,
            zIndex: 10_000,
            isDraft: true,
            showsInlineTitleEditor: draft.showsInlineTitleEditor
        )
    }

    private static func allDayRowHeightPx(rowsCount: Int) -> Double {
        let rows = max(1, rowsCount)
        return 2 * GridLayoutConstants.eventAllDayGap
            + Double(rows) * GridLayoutConstants.eventAllDayRowHeight
    }

    private static func nowLineSnapshot(
        referenceNow: Date,
        visibleDates: [GridVisibleDate],
        hourHeight: Double,
        marginLeft: Double,
        colWidths: [Double]
    ) -> GridLayoutNowLineSnapshot? {
        let dayKey = CompassDateParsing.formatCalendarDay(referenceNow)
        guard let columnIndex = visibleDates.firstIndex(where: { $0.key == dayKey }) else {
            return nil
        }
        let calendar = EffectiveTimeZone.calendar
        let startOfDay = calendar.startOfDay(for: referenceNow)
        let minutes = referenceNow.timeIntervalSince(startOfDay) / 60
        let top = (minutes / 60) * hourHeight
        _ = marginLeft
        _ = colWidths
        return GridLayoutNowLineSnapshot(columnIndex: columnIndex, top: top)
    }
}
