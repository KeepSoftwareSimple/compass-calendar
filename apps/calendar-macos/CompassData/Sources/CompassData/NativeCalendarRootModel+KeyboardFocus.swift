import CompassKit
import Foundation

/// Banners the `p` shortcut can focus, top of the window first.
public enum NativeNotice: String, Sendable, CaseIterable {
    case billingPastDue
    case connectionBanner
    case demoEvents
    case updateReady
    case meetingPageNudge
    case localModeConnectPrompt
}

/// Keyboard focus for the sidebar month picker (`i`) and banners (`p`).
/// The keyboard router sees every key before SwiftUI does, so focus lives
/// here like grid focus does, and the views only draw the ring.
extension NativeCalendarRootModel {
    // MARK: Month picker

    /// Web `useFocusSidebarShortcut`: open the sidebar and focus the
    /// picker's selected day so arrow keys move through dates.
    public func focusSidebar() {
        focusedNotice = nil
        isSidebarOpen = true
        if viewStore.view == .life {
            pendingLifeSidebarFieldFocus = true
            return
        }
        monthPickerFocusDate = pickerCursor(in: monthPickerMonth, from: viewStore.anchorDate)
    }

    private func pickerCursor(in month: Date, from cursor: Date) -> Date {
        let calendar = EffectiveTimeZone.calendar
        return MonthPickerCursor.jump(
            from: cursor, to: month, isWeek: viewStore.visibleDayCount > 1,
            weekStart: calendar.component(.weekday, from: viewStore.anchorDate), calendar: calendar)
    }

    public func browseMonth(_ month: Date) {
        monthPickerMonth = month
        if let cursor = monthPickerFocusDate {
            monthPickerFocusDate = pickerCursor(in: month, from: cursor)
        }
    }

    public func moveMonthPickerFocus(byDays days: Int) {
        let step = viewStore.visibleDayCount > 1 ? (days < 0 ? -7 : 7) : days
        guard let date = monthPickerFocusDate,
              let next = EffectiveTimeZone.calendar.date(byAdding: .day, value: step, to: date)
        else { return }
        monthPickerFocusDate = next
        monthPickerMonth = next
    }

    public func commitMonthPickerFocus() {
        guard let date = monthPickerFocusDate else { return }
        monthPickerFocusDate = nil
        goToDate(date)
    }

    public func clearMonthPickerFocus() {
        monthPickerFocusDate = nil
    }

    // MARK: Notices

    public var visibleNotices: [NativeNotice] {
        var notices: [NativeNotice] = []
        if case let .server(server) = billingStore.appAccess, server.status == .pastDue {
            notices.append(.billingPastDue)
        }
        if connectionBanner != nil { notices.append(.connectionBanner) }
        if showsDemoEventsBanner { notices.append(.demoEvents) }
        if desktopUpdateReadyVersion != nil { notices.append(.updateReady) }
        if showsMeetingPageNudge { notices.append(.meetingPageNudge) }
        if showsLocalModeConnectPrompt { notices.append(.localModeConnectPrompt) }
        return notices
    }

    /// Web `useFocusNoticeShortcut`: focus a notice, and cycle on repeat presses.
    public func focusNextNotice() {
        let notices = visibleNotices
        guard !notices.isEmpty else {
            focusedNotice = nil
            return
        }
        monthPickerFocusDate = nil
        if let current = focusedNotice, let index = notices.firstIndex(of: current) {
            focusedNotice = notices[(index + 1) % notices.count]
        } else {
            focusedNotice = notices[0]
        }
    }

    /// Enter on a focused notice runs its button.
    public func activateFocusedNotice() {
        guard let notice = focusedNotice else { return }
        focusedNotice = nil
        switch notice {
        case .billingPastDue:
            billingStore.openCheckoutFromPastDueBanner()
        case .demoEvents:
            dismissDemoEventsBanner()
        case .updateReady:
            onDesktopRestartToUpdate?()
        case .connectionBanner:
            runConnectionBannerAction()
        case .meetingPageNudge:
            openBookingSettings()
        case .localModeConnectPrompt:
            startTrialFromLocalModePrompt()
        }
    }

    public func clearNoticeFocus() {
        focusedNotice = nil
    }

    // MARK: Billing

    /// Web `other-subscribe` (`b`): only while a trial runs.
    func openUpgradeConfirmation() {
        guard billingStore.status?.subscriptionStatus == .trialing else { return }
        billingStore.isUpgradeConfirmationPresented = true
    }

    // MARK: Shortcuts

    /// Records a shortcut invocation for the levels/tips telemetry, if the id
    /// belongs to a section. Every shortcut handler funnels through here so the
    /// `section(for:)` lookup lives in one place.
    public func recordShortcut(_ id: ShortcutId) {
        guard let section = ShortcutTelemetrySection.section(for: id) else { return }
        levelsStore.recordShortcutInvocation(id, section: section)
        noteShortcutEngagementIfAnonymous()
    }

    public func handleShortcut(_ id: ShortcutId) {
        if id == .createTimed || id == .createAllday {
            guard !settingsStore.isPresented, !authStore.isModalPresented,
                  !pendingLogoutConfirmation, !pendingDiscardDraftConfirmation,
                  billingStore.gateStatus == nil else { return }
        }
        recordShortcut(id)
        switch id {
        case .createTimed, .createAllday:
            if viewStore.view == .life {
                viewStore.view = .week
                scheduleRefreshVisibleRange()
            }
            if id == .createTimed { createTimedDraft(activity: .createShortcut) }
            else { createAllDayDraft() }
        case .navNext:
            if viewStore.view == .life {
                lifeStore.cycleVariation(direction: 1)
            } else {
                pageWindow(direction: 1)
            }
        case .navPrevious:
            if viewStore.view == .life {
                lifeStore.cycleVariation(direction: -1)
            } else {
                pageWindow(direction: -1)
            }
        case .navToday:
            if viewStore.view == .life {
                lifeStore.focusCurrentWeek()
            } else {
                goToToday()
            }
        case .navLifePrev:
            lifeStore.cycleVariation(direction: -1)
        case .navLifeNext:
            lifeStore.cycleVariation(direction: 1)
        case .navLifeCurrent:
            lifeStore.focusCurrentWeek()
        case .navLifeView:
            viewStore.view = .life
            rebuildPresentation()
        case .navDayView:
            viewStore.view = .day
            viewStore.setVisibleDayCount(1)
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        case .navWeekView:
            viewStore.view = .week
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        case .navShiftLeft:
            shiftViewByDay(-1)
        case .navShiftRight:
            shiftViewByDay(1)
        case .navMonthPrev:
            shiftMonth(by: -1)
        case .navMonthNext:
            shiftMonth(by: 1)
        case .navMonthCurrent:
            goToMonthPickerCurrentMonth()
        case .navScrollUp:
            pendingScroll = .pageUp
        case .navScrollDown:
            pendingScroll = .pageDown
        case .navScrollHourUp:
            pendingScroll = .hourUp
        case .navScrollHourDown:
            pendingScroll = .hourDown
        case .editFocusPrev:
            moveFocus(.up)
        case .editFocusNext:
            moveFocus(.down)
        case .editFocusLeft:
            moveFocus(.left)
        case .editFocusRight:
            moveFocus(.right)
        case .editCycleEdge:
            cycleFocusedEdge(forward: true)
        case .otherSettings:
            settingsStore.open(page: .accounts)
        case .otherTimeTravel:
            settingsStore.openTimezoneDialog(.timeTravel)
        case .otherPalette:
            toggleCommandPalette()
        case .otherShortcuts:
            toggleShortcutsLegend()
        case .otherSidebar:
            isSidebarOpen.toggle()
        case .focusSidebar:
            focusSidebar()
        case .focusEvent:
            focusFirstCalendarEvent()
        case .focusNotice:
            focusNextNotice()
        case .focusShiftHold:
            if eventJumpSelection.modeActive {
                _ = handleEventJumpKeystroke("f")
            } else {
                activateEventJumpMode()
            }
        case .otherSubscribe:
            openUpgradeConfirmation()
        case .navGoToDate:
            toggleCommandPalette(fromGoToDate: true)
        default:
            break
        }
    }

    public func handleShiftTabCycleEdge() {
        cycleFocusedEdge(forward: false)
    }

    public func setPageJumpHintsVisible(_ visible: Bool) {
        if !visible, UITestLaunchPolicy.showPageJumpHintsForUITest {
            return
        }
        focusStore.setPageJumpHintsVisible(visible)
        rebuildPresentation()
    }

    public func focusDayColumn(calendarId: String) {
        focusedDayColumnCalendarId = calendarId
        pendingFocusDayColumnCalendarId = calendarId
        applyFocusPresentation()
    }

    public func setEventJumpHintsVisible(_ visible: Bool) {
        if visible {
            eventJumpHintLabels = buildEventJumpHints()
        } else if !eventJumpSelection.modeActive {
            eventJumpHintLabels = []
        }
        applyFocusPresentation()
    }

    public func showPointerHint(
        for target: PointerClickTarget,
        registry: ShortcutRegistry,
        slotClick: GridPointerSlotClickContext? = nil,
        focusedGridEventLabel: String? = nil
    ) {
        var resolvedFocusLabel = focusedGridEventLabel
        if target == .eventCard, resolvedFocusLabel == nil {
            resolvedFocusLabel = gridFocusAccessibilityLabel ?? focusedGridEventAccessibilityLabel()
        }
        pointerHintStore.pulse(
            target: target,
            registry: registry,
            slotClick: slotClick,
            focusedGridEventLabel: resolvedFocusLabel
        )
    }

    public func handleEventCardPointerDown(eventId: String, registry: ShortcutRegistry) {
        focusEvent(eventId: eventId)
        showPointerHint(for: .eventCard, registry: registry)
    }

    public func focusGridEvent(eventId: String) {
        focusEvent(eventId: eventId)
    }

    public func publishGridFocusAccessibilityProbe(eventId: String? = nil) {
        let cards = currentGridCards()
        let resolved =
            gridFocusAccessibilityLabel
            ?? eventId.flatMap { resolveGridFocusLabel(eventId: $0, cards: cards) }
            ?? focusedGridEventAccessibilityLabel()
        if let resolved {
            gridFocusAccessibilityLabel = resolved
        }
        onGridFocusAccessibilityLabelChanged?(resolved)
    }

    public func publishEventFormTitleAccessibilityProbe() {
        let visible = isEventFormVisible
        if visible != eventFormTitleProbeVisible {
            eventFormTitleProbeVisible = visible
            onEventFormTitleAccessibilityProbeChanged?(visible)
            return
        }
        if visible {
            onEventFormTitleAccessibilityProbeTitleSync?(draftStore.gridDraft?.title)
        }
    }

    public func focusPageJump(digit: Character) {
        guard let target = focusStore.pageJumpTargets.first(where: { $0.digit == String(digit) }) else {
            return
        }
        switch target.id {
        case "view-select":
            isViewSwitcherOpen = true
        case "up-next":
            // Web focuses the Up next card so Enter opens it; with no event the digit does nothing.
            openUpNextEvent()
        case "month-picker":
            monthPickerMonth = viewStore.anchorDate
        case "calendars":
            focusCalendarList()
        case let id where id.hasPrefix(PageJumpTargets.calendarAccountPrefix):
            // Web clicks a collapsed heading so the jump shows its calendars.
            let key = String(id.dropFirst(PageJumpTargets.calendarAccountPrefix.count))
            if isAccountCollapsed(key) {
                toggleAccountCollapsed(key)
            }
            focusCalendarList(key)
        case let id where id.hasPrefix(PageJumpTargets.dayColumnPrefix):
            let calendarId = String(id.dropFirst(PageJumpTargets.dayColumnPrefix.count))
            focusDayColumn(calendarId: calendarId)
        default:
            break
        }
    }

    public func consumePendingScroll() -> TimeGridScrollRequest? {
        defer { pendingScroll = nil }
        return pendingScroll
    }

    public func registerNowCuePulse() {
        guard viewStore.view != .life else { return }
        nowCuePulseTask?.cancel()
        nowCueHeaderHighlight = true
        nowCuePulseTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            self?.nowCueHeaderHighlight = false
        }
    }

    // MARK: Grid focus

    private func moveFocus(_ direction: FocusMoveDirection) {
        let arrowKey: String = {
            switch direction {
            case .up: return "ArrowUp"
            case .down: return "ArrowDown"
            case .left: return "ArrowLeft"
            case .right: return "ArrowRight"
            }
        }()
        if nudgeDraftOrPlace(key: arrowKey, shiftKey: false, altKey: false) {
            return
        }

        guard !focusLayoutCards.isEmpty else { return }

        if let focusedId = focusStore.focusedEventId?.rawValue,
            let focused = focusLayoutCard(for: focusedId),
            let next = GridFocusNavigator.adjacent(
                focused: focused,
                direction: direction,
                candidates: focusLayoutCards,
                layoutMode: layoutMode()
            )
        {
            focusEvent(eventId: next.eventId)
            return
        }

        // Match web `moveDraftOrFocusAdjacent`: seed nearest-to-now only when nothing is focused.
        guard focusStore.focusedEventId == nil else { return }

        if let seeded = seedFocusEventId() {
            focusEvent(eventId: seeded)
        }
    }

    private func focusLayoutCard(for eventId: String) -> FocusLayoutCard? {
        if let card = focusLayoutCards.first(where: { $0.eventId == eventId }) {
            return card
        }
        guard
            let card = currentGridCards().first(where: { $0.eventId == eventId })
        else { return nil }
        return FocusLayoutCard(
            eventId: card.eventId,
            frame: card.frame,
            isAllDay: card.kind == .allDay
        )
    }

    private func cycleFocusedEdge(forward: Bool) {
        guard let eventId = focusStore.focusedEventId else { return }
        focusStore.cycleEdge(
            for: eventId,
            direction: forward ? .forward : .backward
        )
        applyFocusPresentation()
    }

    func focusEvent(eventId: String) {
        let type: ViewInteractionEventType =
            focusLayoutCards.first(where: { $0.eventId == eventId })?.isAllDay == true
                ? .allDay
                : .timed
        focusStore.setFocused(
            eventId: EventId(rawValue: eventId),
            eventType: type
        )
        applyFocusPresentation()
    }

    /// Web `u`: leave sidebar/event-form focus and land on the grid. Seeds the
    /// nearest event when nothing on the grid is focused yet.
    public func focusFirstCalendarEvent() {
        clearMonthPickerFocus()
        clearNoticeFocus()
        focusedCalendarListKey = nil
        if viewStore.view == .life {
            lifeStore.focusCurrentWeek()
            return
        }
        if focusStore.focusedEventId == nil, let seeded = seedFocusEventId() {
            focusEvent(eventId: seeded)
            return
        }
        applyFocusPresentation()
    }

    private func seedFocusEventId() -> String? {
        let reference = referenceNow
        if !loadedEvents.isEmpty {
            if let nearest = loadedEvents.min(by: { lhs, rhs in
                abs(eventStart(lhs).timeIntervalSince(reference))
                    < abs(eventStart(rhs).timeIntervalSince(reference))
            }) {
                return nearest.id.rawValue
            }
        }
        return focusLayoutCards.sorted { $0.frame.top < $1.frame.top }.first?.eventId
    }

    func eventStart(_ event: Event) -> Date {
        switch event.schedule {
        case .timed(let timed):
            CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue) ?? .distantPast
        case .allDay(let allDay):
            CompassDateParsing.parseInEffectiveTimeZone(allDay.start) ?? .distantPast
        }
    }

    func applyFocusPresentation() {
        var scenario = timeGridState.scenario
        scenario.draftOverlay = draftOverlayForPresentation()
        scenario.pinnedDayColumnCalendarIds = pinnedDayColumnCalendarIds()
        scenario.defaultTargetCalendarId = defaultTargetCalendarId()?.rawValue
        let hasSecondaryTimeZone = viewStore.timeTravelTimeZone != nil
        let eventJumpActive = eventJumpSelection.modeActive || eventJumpSelection.isActive
        let showDayJumpPrefixes =
            !isEventFormVisible && (focusStore.pageJumpHintsVisible || eventJumpActive)
        timeGridState = TimeGridState(
            layoutMode: timeGridState.layoutMode,
            referenceNow: timeGridState.referenceNow,
            scenario: scenario,
            trackWidth: timeGridState.trackWidth,
            focusedEventId: focusStore.focusedEventId?.rawValue,
            sidebarEditingEventId: sidebarEditingGridEventId(),
            eventJumpHints: eventJumpHintLabels,
            quickTimeSlotHints: quickTimeSlotHintLabels,
            focusedDayColumnCalendarId: focusedDayColumnCalendarId,
            pageJumpHintsVisible: focusStore.pageJumpHintsVisible,
            pageJumpDigitByCalendarId: pageJumpDigitByCalendarId(),
            showDayJumpPrefixes: showDayJumpPrefixes,
            dayJumpUseShiftPrefix: !eventJumpSelection.modeActive,
            eventJumpActiveDayKeys: eventJumpSelection.activeDayKeys,
            hasSecondaryTimeZone: hasSecondaryTimeZone,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        )
        let cards = currentGridCards()
        gridFocusAccessibilityLabel = focusStore.focusedEventId.flatMap { focusedId in
            resolveGridFocusLabel(eventId: focusedId.rawValue, cards: cards)
        }
        if pointerHintStore.isVisible {
            pointerHintStore.updateFocusedGridEventLabel(gridFocusAccessibilityLabel)
        }
        onGridFocusAccessibilityLabelChanged?(gridFocusAccessibilityLabel)
    }

    private func focusedGridEventAccessibilityLabel() -> String? {
        guard let focusedId = focusStore.focusedEventId?.rawValue else { return nil }
        return resolveGridFocusLabel(eventId: focusedId, cards: currentGridCards())
    }

    func resolveGridFocusLabel(eventId: String, cards: [GridLayoutCardSnapshot]) -> String? {
        if let label = cards.first(where: { $0.eventId == eventId })?.label {
            return label
        }
        guard let event = loadedEvents.first(where: { $0.id.rawValue == eventId }) else { return nil }
        switch event.content {
        case .busy:
            return CalendarEventViewModel.busyEventTitle
        case .details(let details):
            return details.title
        }
    }
}
