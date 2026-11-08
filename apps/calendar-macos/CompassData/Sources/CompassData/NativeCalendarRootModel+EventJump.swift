import CompassKit
import Foundation

extension NativeCalendarRootModel {
    /// Web `VIEW_SHORTCUT_KEYS`: view switches use keyup globally; grid jump uses
    /// keydown. These letters fall through jump mode so `nav-*-view` can run.
    private static let viewNavigationFallthroughLetters: Set<Character> = ["d", "w", "l"]

    public var eventJumpSelection: EventJumpSelectionStore { overlayStores.eventJumpSelection }

    public var eventJumpStatusText: String? {
        guard eventJumpSelection.isActive else { return nil }
        if eventJumpSelection.modeActive,
            eventJumpSelection.activeDayKeys.isEmpty,
            eventJumpSelection.dayJumpBuffer.isEmpty,
            eventJumpSelection.announcement == nil
        {
            return "Event jump on · Esc"
        }
        if eventJumpSelection.dayJumpBuffer == "s", eventJumpSelection.activeDayKeys.isEmpty {
            return "Shift+U Sunday · Shift+A Saturday · Esc"
        }
        if let announcement = eventJumpSelection.announcement {
            if eventJumpSelection.activeDayKeys.isEmpty {
                return "Event jump · \(announcement) · Esc"
            }
            return "Jump · \(announcement) · C timed · Shift+C all-day · Esc"
        }
        return "Event jump · Esc"
    }

    public func activateEventJumpMode() {
        guard !eventJumpSelection.modeActive else { return }
        eventJumpSelection.setModeActive(true)
        recordShortcut(.focusShiftHold)
        refreshEventJumpPresentation()
    }

    public func toggleEventJumpMode() {
        if eventJumpSelection.modeActive {
            clearEventJumpSelection()
            draftStore.setQuickTimeDigits("")
            return
        }
        activateEventJumpMode()
    }

    func refreshEventJumpPresentation() {
        if eventJumpSelection.modeActive {
            eventJumpHintLabels = buildEventJumpHints()
            quickTimeSlotHintLabels = buildQuickTimeSlotHints()
        } else {
            eventJumpHintLabels = []
            quickTimeSlotHintLabels = []
        }
        onEventJumpChipsAccessibilityProbeChanged?(eventJumpHintLabels)
        applyFocusPresentation()
    }

    public func handleShiftDayJump(letter: Character) {
        guard viewStore.view == .week || viewStore.view == .day else { return }
        if !eventJumpSelection.modeActive {
            eventJumpSelection.setModeActive(true)
        }
        let lower = String(letter).lowercased()

        if eventJumpSelection.dayJumpBuffer == "s" {
            if lower == "u" {
                selectJumpDay(prefix: "su")
                return
            }
            if lower == "a" {
                selectJumpDay(prefix: "sa")
                return
            }
        }

        if lower == "s" {
            eventJumpSelection.setWeekendDisambiguation(announcement: "Weekend")
            recordShortcut(.focusWeekDay)
            refreshEventJumpPresentation()
            return
        }

        guard let prefix = DayJumpPrefixes.dayPrefix(forShiftedLetter: letter) else { return }
        selectJumpDay(prefix: prefix)
    }

    /// Web jump mode: lowercase day prefixes plus digits (`f4`, `su8`).
    /// Uppercase letters are accepted. `e` / `c` fall through; other unknown
    /// letters are swallowed so leader keys cannot fire.
    @discardableResult
    public func handleEventJumpKeystroke(_ key: Character) -> Bool {
        guard eventJumpSelection.modeActive else { return false }
        let normalized = Character(String(key).lowercased())
        if Self.viewNavigationFallthroughLetters.contains(normalized) {
            return false
        }
        if normalized.isNumber {
            return handleEventJumpDigit(normalized)
        }
        switch normalized.lowercased() {
        case "e", "c":
            return false
        default:
            break
        }
        guard
            let match = DayJumpKeys.matchKeystroke(
                assignments: dayJumpAssignments(),
                dayKeyByPrefix: dayKeyByPrefixForJump(),
                key: normalized,
                buffer: eventJumpSelection.dayJumpBuffer
            )
        else {
            return normalized.isLetter
        }
        applyEventJumpKeystrokeMatch(match)
        return true
    }

    public func handleEventJumpLetter(_ letter: Character) -> Bool {
        handleEventJumpKeystroke(letter)
    }

    private func dayKeyByPrefixForJump() -> [String: String] {
        let calendar = EffectiveTimeZone.calendar
        var map: [String: String] = [:]
        for dayKey in visibleDateKeys() {
            guard let date = CompassDateParsing.calendarDateInEffectiveTimeZone(dayKey) else { continue }
            let weekday = calendar.component(.weekday, from: date) - 1
            map[DayJumpPrefixes.prefix(forWeekday: weekday)] = dayKey
        }
        return map
    }

    private func applyEventJumpKeystrokeMatch(_ match: DayJumpKeys.KeystrokeMatch) {
        eventJumpCommitTask?.cancel()
        switch match {
        case let .selectDay(dayPrefix, dayKey, firstEventId, buffer):
            resetEventJumpTimeBurst()
            let name = DayJumpPrefixes.displayName(forPrefix: dayPrefix)
            eventJumpSelection.selectDay(
                key: dayKey,
                announcement: "\(name) selected",
                buffer: buffer
            )
            recordShortcut(.focusWeekDay)
            if let firstEventId {
                focusEvent(eventId: firstEventId)
            }
            refreshEventJumpPresentation()
        case let .prefix(buffer, pendingExactEventId):
            if buffer == "s" {
                eventJumpSelection.setWeekendDisambiguation(announcement: "Weekend")
            } else {
                eventJumpSelection.setDayJumpBuffer(buffer)
            }
            refreshEventJumpPresentation()
            if let pendingExactEventId {
                eventJumpCommitTask = Task { @MainActor [weak self] in
                    try? await Task.sleep(for: DayJumpKeys.ambiguousCommitDelay)
                    guard !Task.isCancelled, let self, self.eventJumpSelection.dayJumpBuffer == buffer else { return }
                    self.commitEventJump(eventId: pendingExactEventId)
                }
            }
        case let .focus(eventId, buffer):
            eventJumpSelection.setDayJumpBuffer(buffer)
            commitEventJump(eventId: eventId)
        }
    }

    private func selectJumpDay(prefix: String) {
        resetEventJumpTimeBurst()
        let calendar = EffectiveTimeZone.calendar
        for dayKey in visibleDateKeys() {
            guard let date = CompassDateParsing.calendarDateInEffectiveTimeZone(dayKey) else { continue }
            let weekday = calendar.component(.weekday, from: date) - 1
            guard DayJumpPrefixes.prefix(forWeekday: weekday) == prefix else { continue }
            let name = DayJumpPrefixes.displayName(forPrefix: prefix)
            eventJumpSelection.selectDay(
                key: dayKey,
                announcement: "\(name) selected",
                buffer: prefix
            )
            recordShortcut(.focusWeekDay)
            // Assignments run in day order then index, so this is the day's 1.
            if let first = dayJumpAssignments().first(where: { $0.dayKey == dayKey }) {
                focusEvent(eventId: first.eventId)
            }
            refreshEventJumpPresentation()
            return
        }
    }

    /// Web `matchDayJumpKeystroke` digits: once a day is typed, digits pick
    /// that day's events (W1, W12). Before that they belong to quick-time, so
    /// this returns false.
    public func handleEventJumpDigit(_ digit: Character) -> Bool {
        defer { eventJumpTimeBurstEndedAt = Date() }
        let buffer = eventJumpSelection.dayJumpBuffer
        guard !buffer.isEmpty, buffer != "s" else { return false }
        eventJumpCommitTask?.cancel()
        if commitTypedTimeOnPickedDay(appending: digit) {
            return true
        }
        switch DayJumpKeys.matchDigit(dayJumpAssignments(), next: buffer + String(digit)) {
        case .focus(let eventId, _):
            commitEventJump(eventId: eventId)
        case .prefix(let next, let exactEventId):
            eventJumpSelection.setDayJumpBuffer(next)
            refreshEventJumpPresentation()
            if let exactEventId {
                eventJumpCommitTask = Task { @MainActor [weak self] in
                    try? await Task.sleep(for: DayJumpKeys.ambiguousCommitDelay)
                    guard !Task.isCancelled, let self, self.eventJumpSelection.dayJumpBuffer == next else { return }
                    self.commitEventJump(eventId: exactEventId)
                }
            }
        case .none:
            break
        }
        return true
    }

    /// Web column time burst: with one day picked, four digits typed within
    /// `typedTimeWindow` create at that time on the picked column (Shift+T
    /// then 1230). Ordinal picks along the way still focus.
    private func commitTypedTimeOnPickedDay(appending digit: Character) -> Bool {
        guard eventJumpSelection.activeDayKeys.count == 1 else { return false }
        let now = Date()
        if let ended = eventJumpTimeBurstEndedAt,
            now.timeIntervalSince(ended) >= DayJumpKeys.typedTimeWindow
        {
            eventJumpTimeBurstDigits = ""
        }
        eventJumpTimeBurstDigits.append(digit)
        guard !QuickTime.canBufferGrow(eventJumpTimeBurstDigits) else { return false }
        let burst = eventJumpTimeBurstDigits
        resetEventJumpTimeBurst()
        draftStore.setQuickTimeDigits(burst)
        commitQuickTimeIfBuffered()
        return true
    }

    private func resetEventJumpTimeBurst() {
        eventJumpTimeBurstDigits = ""
        eventJumpTimeBurstEndedAt = nil
    }

    /// Web `commitFocus`: keep the day selected so the next digit picks again.
    private func commitEventJump(eventId: String) {
        let buffer = eventJumpSelection.dayJumpBuffer
        eventJumpSelection.setDayJumpBuffer(String(buffer.prefix { !$0.isNumber }))
        focusEvent(eventId: eventId)
        refreshEventJumpPresentation()
    }

    public func clearEventJumpSelection() {
        eventJumpCommitTask?.cancel()
        resetEventJumpTimeBurst()
        eventJumpSelection.clear()
        eventJumpHintLabels = []
        quickTimeSlotHintLabels = []
        applyFocusPresentation()
    }

    func buildQuickTimeSlotHints() -> [QuickTimeSlotHint] {
        guard eventJumpSelection.modeActive else { return [] }
        let focusedDay = QuickTime.quickTimeFocusedColumnDay(
            activeDayKeys: eventJumpSelection.activeDayKeys)
        let targetDay = QuickTime.quickTimeTargetDay(
            startOfView: startOfView,
            endOfView: endOfView,
            now: referenceNow,
            focusedDay: focusedDay
        )
        let timedStarts: [Date] = loadedEvents.compactMap { event in
            guard case .timed(let timed) = event.schedule else { return nil }
            return CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue)
        }
        let timedEnds: [Date] = loadedEvents.compactMap { event in
            guard case .timed(let timed) = event.schedule else { return nil }
            return CompassDateParsing.parseInEffectiveTimeZone(timed.end.rawValue)
        }
        let busy = QuickTime.timedEventsToBusyIntervals(startDates: timedStarts, endDates: timedEnds)
        let slots = QuickTime.buildQuickTimeSlots(busy: busy, targetDay: targetDay)
        let visibleDates = GridVisibleDate.fromKeys(timeGridState.scenario.visibleDateKeys)
        let colWidths = timeGridState.resolvedColumnWidths()
        let snapshotMetrics = timeGridState.snapshot(colWidths: colWidths).metrics
        let gridMetrics = GridMetrics(
            colWidths: snapshotMetrics.colWidths,
            hourHeight: snapshotMetrics.hourHeight
        )
        let columnIndex: Int? = {
            let key = CompassDateParsing.formatCalendarDay(targetDay)
            return visibleDates.firstIndex(where: { $0.key == key })
        }()
        return slots.compactMap { slot in
            let frame = EventPositionCalculator.getBusyPeriodPosition(
                segmentStart: slot.start,
                segmentEnd: slot.end,
                measurements: gridMetrics,
                visibleDates: visibleDates,
                columnIndex: columnIndex,
                hasSecondaryTimeZone: timeGridState.hasSecondaryTimeZone
            )
            guard frame.width > 0, frame.height > 0 else { return nil }
            return QuickTimeSlotHint(sequence: slot.sequence, frame: frame)
        }
    }

    func eventJumpDayKey(for event: Event) -> String {
        switch event.schedule {
        case .timed(let timed):
            let start = CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue) ?? referenceNow
            return CompassDateParsing.formatCalendarDay(start)
        case .allDay(let allDay):
            let start = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.start) ?? referenceNow
            return CompassDateParsing.formatCalendarDay(start)
        }
    }

}
