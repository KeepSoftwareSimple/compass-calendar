import CompassKit
import Foundation
import os

extension NativeCalendarRootModel {
    func draftTargetDay() -> Date {
        let calendar = EffectiveTimeZone.calendar
        let now = referenceNow
        if let pointerDraftDateKey,
            let parked = CompassDateParsing.calendarDateInEffectiveTimeZone(pointerDraftDateKey)
        {
            return calendar.startOfDay(for: parked)
        }
        let jumpColumnDay = QuickTime.quickTimeFocusedColumnDay(
            activeDayKeys: eventJumpSelection.activeDayKeys)
        let focusedDay: Date? = {
            if let jumpColumnDay { return jumpColumnDay }
            guard let focusedId = focusStore.focusedEventId?.rawValue,
                let event = loadedEvents.first(where: { $0.id.rawValue == focusedId })
            else { return nil }
            switch event.schedule {
            case .timed(let timed):
                return CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue)
            case .allDay(let allDay):
                return CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.start)
            }
        }()
        return QuickTime.quickTimeTargetDay(
            startOfView: startOfView,
            endOfView: endOfView,
            now: now,
            focusedDay: focusedDay
        )
    }

    public func createTimedDraft(activity: DraftNudgeActivity) {
        guard viewStore.view != .life, defaultTargetCalendarId() != nil else { return }
        if draftStore.gridDraft != nil, activity == .keyboardPlace { return }

        let targetDay = draftTargetDay()
        let times = DraftTiming.getDraftTimes(targetDay: targetDay, now: referenceNow)
        let schedule = DraftSchedule(
            start: times.start,
            end: times.end,
            kind: .timed
        )
        let draft = GridEventDraft(
            clientId: GridEventDraftFactory.makeClientEventId(),
            schedule: schedule,
            calendarId: defaultTargetCalendarId()
        )
        draftStore.startGridDraft(activity: activity, draft: draft)
        rebuildPresentation()
        focusDraftCard()
    }

    public func createAllDayDraft() {
        guard viewStore.view != .life, let calendarId = defaultTargetCalendarId() else { return }
        let calendar = EffectiveTimeZone.calendar
        let day = calendar.startOfDay(for: draftTargetDay())
        guard let end = calendar.date(byAdding: .day, value: 1, to: day) else { return }
        let draft = GridEventDraft(
            clientId: GridEventDraftFactory.makeClientEventId(),
            schedule: DraftSchedule(start: day, end: end, kind: .allDay),
            calendarId: calendarId
        )
        draftStore.startGridDraft(activity: .createShortcut, draft: draft)
        rebuildPresentation()
        focusDraftCard()
    }

    public func placeTimedDraft() {
        createTimedDraft(activity: .keyboardPlace)
    }

    public func setDraftTitle(_ title: String) {
        guard let draft = draftStore.gridDraft, !isEventFormReadOnly(for: draft) else { return }
        draftStore.setTitle(title)
        rebuildPresentation()
    }

    @discardableResult
    public func nudgeDraftOrPlace(
        key: String,
        shiftKey: Bool,
        altKey: Bool
    ) -> Bool {
        guard viewStore.view != .life else { return false }

        if shiftKey {
            if draftStore.gridDraft != nil {
                let moved = nudgeDraft(key: key, altKey: altKey)
                if moved { rebuildPresentation() }
                return moved
            }
            if focusStore.focusedEventId != nil { return false }
            placeTimedDraft()
            return true
        }

        if draftStore.gridDraft != nil {
            let moved = nudgeDraft(key: key, altKey: altKey)
            if moved { rebuildPresentation() }
            return moved
        }
        return false
    }

    private func nudgeDraft(key: String, altKey: Bool) -> Bool {
        guard let draft = draftStore.gridDraft, !isScheduleLocked(for: draft) else { return false }
        return draftStore.nudgeByKeyboard(
            key: key,
            altKey: altKey,
            isStartAllowed: { nextStart in
                let calendar = EffectiveTimeZone.calendar
                let start = calendar.startOfDay(for: nextStart)
                let viewStart = calendar.startOfDay(for: self.startOfView)
                let viewEnd = calendar.startOfDay(for: self.endOfView)
                return start >= viewStart && start <= viewEnd
            }
        ) != nil
    }

    public func handleQuickTimeDigit(_ digit: Character) {
        guard viewStore.view != .life, draftStore.gridDraft == nil else { return }
        guard eventJumpSelection.modeActive || eventJumpSelection.isActive || pointerDraftDateKey != nil else {
            return
        }
        guard digit.isNumber else { return }

        let next = draftStore.quickTimeDigits + String(digit)
        draftStore.setQuickTimeDigits(next)

        if !QuickTime.canBufferGrow(next) {
            commitQuickTimeDigits()
        }
    }

    public func commitQuickTimeIfBuffered() {
        if !draftStore.quickTimeDigits.isEmpty {
            commitQuickTimeDigits()
        }
    }

    private func commitQuickTimeDigits() {
        let digits = draftStore.quickTimeDigits
        draftStore.setQuickTimeDigits("")
        guard !digits.isEmpty else { return }
        let start: Date? = {
            if let pointerDraftStartISO,
                let pointerDraftTimeKey,
                digits == pointerDraftTimeKey,
                let parsed = CompassDateParsing.parseInEffectiveTimeZone(pointerDraftStartISO)
            {
                return parsed
            }
            return QuickTime.resolveQuickTimeStart(digits: digits, targetDay: draftTargetDay())
        }()
        guard let start else { return }
        clearPointerDraftIntent()
        let end = DraftTiming.timedDraftEnd(start: start)
        guard defaultTargetCalendarId() != nil else { return }

        let draft = GridEventDraft(
            clientId: GridEventDraftFactory.makeClientEventId(),
            schedule: DraftSchedule(start: start, end: end, kind: .timed),
            calendarId: defaultTargetCalendarId()
        )
        draftStore.startGridDraft(activity: .keyboardPlace, draft: draft)
        clearEventJumpSelection()
        rebuildPresentation()
        focusDraftCard()
    }

    /// Keyboard-place Enter must finish before the next shortcut; XCUITest does not wait on async Tasks.
    public func saveKeyboardPlacedDraftNow() {
        guard let draft = draftStore.gridDraft,
            draftStore.status.activity == .keyboardPlace,
            draft.kind == .create
        else { return }
        guard let input = GridEventDraftMapping.createInput(from: draft),
            let optimistic = GridEventDraftMapping.optimisticEvent(
                from: draft,
                baseline: baselineEvent(for: draft))
        else { return }

        let savedId = optimistic.id.rawValue
        draftStore.commit()
        formFieldDigitHintsVisible = false
        recordCreateUndo(for: optimistic)
        do {
            try eventsStore.stageOptimisticCreate(optimistic)
            loadedEvents = try eventsStore.fetchAllEvents()
        } catch {
            reportSaveFailure(error, action: "create")
        }
        rebuildPresentation()
        focusEvent(eventId: savedId)
        keyboardCreateSettleGeneration += 1
        let settleGeneration = keyboardCreateSettleGeneration
        Task {
            guard settleGeneration == keyboardCreateSettleGeneration else { return }
            await eventsStore.settleStagedCreate(input: input, optimisticEvent: optimistic)
        }
    }

    func persistDraftOptimistic(savedId: String, apply: () async throws -> Void) async {
        let revision = sessionRevision
        draftStore.commit()
        formFieldDigitHintsVisible = false
        do {
            try await apply()
            guard revision == sessionRevision else { return }
            loadedEvents = try eventsStore.fetchAllEvents()
            rebuildPresentation()
            focusEvent(eventId: savedId)
        } catch {
            guard revision == sessionRevision else { return }
            reportSaveFailure(error, action: "save")
        }
    }

    /// Web parity: `showErrorToast`. The form is already closed, so the toast is the only signal.
    func reportSaveFailure(_ error: Error, action: String) {
        Self.log.error("event \(action, privacy: .public) failed: \(String(describing: error), privacy: .public)")
        statusToastStore.show(id: "event-save-error", message: "Could not \(action) event. Try again.")
        if let events = try? eventsStore.fetchAllEvents() {
            loadedEvents = events
            rebuildPresentation()
        }
    }

    public func saveDraft() async {
        await saveDraftWithInvitationGate()
    }

    public func requestDiscardDraft() {
        guard let draft = draftStore.gridDraft else { return }
        if draftStore.status.isFormOpen {
            requestCloseEventForm()
            return
        }
        if draftStore.status.activity == .keyboardPlace,
            !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            pendingDiscardDraftConfirmation = true
            return
        }
        discardDraftConfirmed()
    }

    public func discardDraftConfirmed() {
        pendingDiscardDraftConfirmation = false
        draftStore.discard()
        formFieldDigitHintsVisible = false
        rebuildPresentation()
    }

    public func cancelDiscardDraftConfirmation() {
        pendingDiscardDraftConfirmation = false
    }

    public func toggleDedicationDialog() {
        dedicationDialogVisible.toggle()
    }

    private func focusDraftCard() {
        guard let id = draftStore.gridDraft?.clientId.rawValue else { return }
        focusEvent(eventId: id)
    }

    func sidebarEditingGridEventId() -> String? {
        guard draftStore.status.isFormOpen, let draft = draftStore.gridDraft else {
            return nil
        }
        switch draft.kind {
        case .edit:
            return draft.persistedEventId?.rawValue
        case .create:
            return draft.clientId.rawValue
        }
    }

    func pinnedDayColumnCalendarIds() -> Set<String> {
        var pinned = Set<String>()
        guard let draft = draftStore.gridDraft else { return pinned }
        if let calendarId = draft.calendarId?.rawValue {
            pinned.insert(calendarId)
        }
        if draftStore.status.isFormOpen, case .edit = draft.kind,
           let sourceId = draft.persistedEventId?.rawValue,
           let event = loadedEvents.first(where: { $0.id.rawValue == sourceId })
        {
            pinned.insert(event.calendarId.rawValue)
        }
        return pinned
    }

    func draftOverlayForPresentation() -> GridLayoutDraftOverlay? {
        guard let draft = draftStore.gridDraft,
            let activity = draftStore.status.activity
        else { return nil }
        let baseline = baselineEvent(for: draft)
        return GridEventDraftMapping.overlay(
            from: draft,
            activity: activity,
            status: draftStore.status,
            sourceColorHex: baseline.flatMap(Self.detailsColorHex(from:))
        )
    }

    static func detailsColorHex(from event: Event) -> String? {
        guard case .details(let payload) = event.content else { return nil }
        return payload.colorHex
    }

    /// Web/TanStack `onMutate`: repaint as soon as the repository cache updates, before the API settles.
    func presentOptimisticCache(_ events: [Event]) {
        loadedEvents = events
        rebuildPresentation()
    }
}
