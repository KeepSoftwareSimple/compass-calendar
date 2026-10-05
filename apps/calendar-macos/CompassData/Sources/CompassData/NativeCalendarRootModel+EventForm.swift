import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var isEventFormVisible: Bool {
        draftStore.status.isFormOpen && draftStore.gridDraft != nil
    }

    public func focusEventFormField(_ field: EventFormField) {
        eventFormFocusedField = field
    }

    public func openKeyboardEditForFocusedEvent() {
        guard viewStore.view != .life,
            draftStore.gridDraft == nil,
            let eventId = focusStore.focusedEventId,
            let event = loadedEvents.first(where: { $0.id == eventId }),
            let draft = GridEventDraftFromEvent.editDraft(from: event)
        else { return }
        draftStore.startGridDraft(activity: .keyboardEdit, draft: draft)
        eventFormFocusedField = .title
        rebuildPresentation()
        focusEvent(eventId: eventId.rawValue)
    }

    public func openEventFormForCurrentDraft() {
        guard draftStore.gridDraft != nil else { return }
        draftStore.setFormOpen(true)
        eventFormFocusedField = .title
        rebuildPresentation()
    }

    public func updateDraftFromForm(
        title: String? = nil,
        calendarId: CalendarId? = nil,
        color: EventColorSlot?? = nil,
        schedule: DraftSchedule? = nil
    ) {
        guard var draft = draftStore.gridDraft else { return }
        if let title { draft.title = title }
        if let calendarId { draft.calendarId = calendarId }
        if let color { draft.color = color }
        if let schedule { draft.schedule = schedule }
        draftStore.setGridDraft(draft)
        rebuildPresentation()
    }

    public func setDraftAllDay(_ allDay: Bool) {
        guard var draft = draftStore.gridDraft else { return }
        let calendar = EffectiveTimeZone.calendar
        if allDay {
            let start = calendar.startOfDay(for: draft.schedule.start)
            let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start
            draft.schedule = DraftSchedule(start: start, end: end, kind: .allDay)
        } else {
            let start = draft.schedule.start
            let end = DraftTiming.timedDraftEnd(start: start)
            draft.schedule = DraftSchedule(start: start, end: end, kind: .timed)
        }
        draftStore.setGridDraft(draft)
        rebuildPresentation()
    }

    public func requestCloseEventForm() {
        guard draftStore.status.isFormOpen else { return }
        if draftStore.hasUnsavedFormChanges || hasMeaningfulDraftTitle() {
            pendingDiscardDraftConfirmation = true
            return
        }
        closeEventFormConfirmed()
    }

    public func closeEventFormConfirmed() {
        pendingDiscardDraftConfirmation = false
        draftStore.discard()
        formFieldDigitHintsVisible = false
        rebuildPresentation()
    }

    public func duplicateFocusedOrFormEvent() async {
        let sourceEvent: Event? = {
            if let draft = draftStore.gridDraft, draft.kind == .edit,
                let id = draft.persistedEventId
            {
                return loadedEvents.first { $0.id == id }
            }
            if let id = focusStore.focusedEventId {
                return loadedEvents.first { $0.id == id }
            }
            return nil
        }()
        guard let event = sourceEvent,
            let duplicate = GridEventDraftFromEvent.duplicateDraft(from: event, calendars: calendars)
        else { return }

        var ready = duplicate
        ready.calendarId = ready.calendarId ?? defaultTargetCalendarId()
        guard let input = GridEventDraftMapping.createInput(from: ready),
            let optimistic = GridEventDraftMapping.optimisticEvent(from: ready)
        else { return }

        draftStore.discard()
        rebuildPresentation()
        let savedId = optimistic.id.rawValue
        do {
            try await eventsStore.createOptimistic(input: input, optimisticEvent: optimistic)
            loadedEvents = try eventsStore.fetchAllEvents()
            rebuildPresentation()
            focusEvent(eventId: savedId)
        } catch {}
    }

    public func deleteFormEvent() async {
        await requestDeleteFormEvent()
    }

    public func jumpEventFormField(digit: Character) {
        guard let field = FormFieldDigitMapping.field(
            forDigitCharacter: digit,
            rows: shortcutRegistry.editSequenceFields
        ) else { return }
        focusEventFormField(field)
    }

    public func formFieldDigitTargets() -> [PageJumpTarget] {
        FormFieldDigitMapping.sortedRows(shortcutRegistry.editSequenceFields).compactMap { row in
            guard EventFormField(rawValue: row.field) != nil else { return nil }
            let anchorId = row.field == "actions" ? "form-actions" : "form-\(row.field)"
            return PageJumpTarget(id: anchorId, digit: row.digit, label: row.label)
        }
    }

    private func hasMeaningfulDraftTitle() -> Bool {
        guard let draft = draftStore.gridDraft else { return false }
        return !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public func baselineEvent(for draft: GridEventDraft) -> Event? {
        guard draft.kind == .edit, let id = draft.persistedEventId else { return nil }
        return loadedEvents.first { $0.id == id }
    }
}
