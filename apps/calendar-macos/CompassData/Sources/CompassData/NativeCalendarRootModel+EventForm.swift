import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var isEventFormVisible: Bool {
        draftStore.status.isFormOpen && draftStore.gridDraft != nil
    }

    public func didCopyDescriptionLink() {
        recordShortcut(.editCopyDescriptionLink)
        statusToastStore.show(id: "description-link-copied", message: "Link copied")
    }

    public func focusEventFormField(_ field: EventFormField) {
        if field == .actions { eventFormActionsFocusRequest += 1 }
        if field == .recurrence { eventFormRecurrenceFocusRequest += 1 }
        if field == .color {
            colorSwatchFocusIndex = Self.colorSwatchOptions.firstIndex(of: draftStore.gridDraft?.color) ?? 0
        }
        eventFormFocusedField = field
    }

    /// Web `EventColorPicker` order: the calendar-default swatch, then each slot.
    public static let colorSwatchOptions: [EventColorSlot?] = [nil] + EventColorSlot.webOrder.map(Optional.some)

    /// Web picker arrows: move focus between swatches without changing the color.
    public func moveColorSwatchFocus(by delta: Int) {
        colorSwatchFocusIndex = min(max(colorSwatchFocusIndex + delta, 0), Self.colorSwatchOptions.count - 1)
    }

    /// Web picker Space / Enter on the focused swatch, or a pick key naming one.
    public func pickColorSwatch(at index: Int) {
        guard Self.colorSwatchOptions.indices.contains(index) else { return }
        colorSwatchFocusIndex = index
        updateDraftFromForm(color: .some(Self.colorSwatchOptions[index]))
    }

    public func openKeyboardEditForFocusedEvent() {
        guard viewStore.view != .life,
            draftStore.gridDraft == nil,
            let eventId = focusStore.focusedEventId,
            let event = loadedEvents.first(where: { $0.id == eventId }),
            let draft = GridEventDraftFromEvent.editDraft(from: event)
        else { return }
        pendingBookingCancellation = nil
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

    public var canChangeDraftCalendar: Bool {
        draftStore.gridDraft?.kind == .create || eventsStore.source == .local
    }

    public func updateDraftFromForm(
        title: String? = nil,
        description: String? = nil,
        location: String? = nil,
        calendarId: CalendarId? = nil,
        color: EventColorSlot?? = nil,
        schedule: DraftSchedule? = nil
    ) {
        guard var draft = draftStore.gridDraft, !isEventFormReadOnly(for: draft) else { return }
        if let title { draft.title = title }
        if let description { draft.description = description }
        if let location { draft.location = location }
        if let calendarId, canChangeDraftCalendar { draft.calendarId = calendarId }
        if let color { draft.color = color }
        if let schedule, !isScheduleLocked(for: draft) { draft.schedule = schedule }
        draftStore.setGridDraft(draft)
        rebuildPresentation()
    }

    public func setDraftAllDay(_ allDay: Bool) {
        guard var draft = draftStore.gridDraft, !isScheduleLocked(for: draft) else { return }
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

    public func updateAllDayDraftStart(_ date: Date) {
        guard let draft = draftStore.gridDraft, draft.schedule.kind == .allDay else { return }
        let calendar = EffectiveTimeZone.calendar
        let start = calendar.startOfDay(for: date)
        guard let minimumEnd = calendar.date(byAdding: .day, value: 1, to: start) else { return }
        updateDraftFromForm(schedule: .init(
            start: start, end: max(draft.schedule.end, minimumEnd), kind: .allDay))
    }

    /// The form shows the last included day; stored all-day ends are exclusive.
    public func updateAllDayDraftEnd(_ date: Date) {
        guard let draft = draftStore.gridDraft, draft.schedule.kind == .allDay else { return }
        let calendar = EffectiveTimeZone.calendar
        let lastDay = max(calendar.startOfDay(for: date), draft.schedule.start)
        guard let end = calendar.date(byAdding: .day, value: 1, to: lastDay) else { return }
        updateDraftFromForm(schedule: .init(start: draft.schedule.start, end: end, kind: .allDay))
    }

    public func requestCloseEventForm() {
        guard draftStore.status.isFormOpen else { return }
        cancelBookedMeetingConfirmation()
        if draftStore.gridDraft?.kind == .edit && draftStore.hasUnsavedFormChanges {
            pendingDiscardDraftConfirmation = true
            return
        }
        discardDraftConfirmed()
    }

    public func closeEventFormConfirmed() {
        discardDraftConfirmed()
    }

    public func duplicateFocusedOrFormEvent() async {
        let revision = sessionRevision
        let sourceEvent: Event? = {
            if let draft = draftStore.gridDraft, draft.kind == .edit,
                let id = draft.persistedEventId
            {
                return loadedEvents.first { $0.id == id }
            }
            return focusedEvent()
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
            guard revision == sessionRevision else { return }
            loadedEvents = try eventsStore.fetchAllEvents()
            recordCreateUndo(for: optimistic)
            rebuildPresentation()
            focusEvent(eventId: savedId)
        } catch {}
    }

    public func deleteFormEvent() async {
        await requestDeleteFormEvent()
    }

    public func jumpEventFormField(digit: Character) {
        guard let input = eventFormFieldVisibilityInput() else { return }
        let rows = EventFormFieldVisibility.visibleDigitRows(
            rows: shortcutRegistry.editSequenceFields,
            input: input
        )
        guard let field = FormFieldDigitMapping.field(forDigitCharacter: digit, rows: rows) else { return }
        focusEventFormField(field)
    }

    public func formFieldDigitTargets() -> [PageJumpTarget] {
        guard let input = eventFormFieldVisibilityInput() else { return [] }
        let rows = EventFormFieldVisibility.visibleDigitRows(
            rows: shortcutRegistry.editSequenceFields,
            input: input
        )
        return FormFieldDigitMapping.sortedRows(rows).compactMap { row in
            guard EventFormField(rawValue: row.field) != nil else { return nil }
            let anchorId = row.field == "actions" ? "form-actions" : "form-\(row.field)"
            return PageJumpTarget(id: anchorId, digit: row.digit, label: row.label)
        }
    }

    public func baselineEvent(for draft: GridEventDraft) -> Event? {
        guard draft.kind == .edit, let id = draft.persistedEventId else { return nil }
        return loadedEvents.first { $0.id == id }
    }
}
