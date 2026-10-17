import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var quickAddTimeDigits: String {
        guard let query = quickAddPanelSession?.query.trimmingCharacters(in: .whitespacesAndNewlines),
              !query.isEmpty, query.allSatisfy(\.isNumber) else { return "" }
        return String(query.prefix(QuickTime.maxDigits))
    }

    public var isSavingQuickAdd: Bool { quickAddPanelSession?.isSaving == true }

    public func beginQuickAddPanelSession() {
        guard quickAddPanelSession == nil else { return }
        let targetDay = viewStore.view == .life
            ? EffectiveTimeZone.calendar.startOfDay(for: referenceNow) : draftTargetDay()
        quickAddPanelSession = QuickAddPanelSession(id: GridEventDraftFactory.makeClientEventId(),
            targetDay: targetDay, sessionRevision: sessionRevision)
        quickAddError = nil
    }

    public func syncQuickAddQuery(_ query: String) {
        guard let session = quickAddPanelSession, session.sessionRevision == sessionRevision else {
            quickAddError = "Reopen Quick Add to use the current account."
            return
        }
        guard !session.isSaving else { return }
        quickAddPanelSession?.query = query
        quickAddError = nil
    }

    @discardableResult
    public func saveQuickAddFromPanel(submitTitle: String? = nil) async -> Bool {
        if let submitTitle { syncQuickAddQuery(submitTitle) }
        guard let session = quickAddPanelSession, session.sessionRevision == sessionRevision else {
            quickAddError = "Reopen Quick Add to use the current account."
            return false
        }
        guard !session.isSaving else { return false }
        guard isSignedIn || eventsStore.source == .local else {
            quickAddError = "Sign in before saving an event."
            return false
        }
        let query = session.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            quickAddError = "Enter an event title or a time."
            return false
        }
        guard let calendarId = defaultTargetCalendarId() else {
            quickAddError = "No writable calendar is available."
            return false
        }
        let digits = quickAddTimeDigits
        let start: Date
        if !digits.isEmpty {
            guard let time = QuickTime.resolveQuickTimeStart(digits: digits, targetDay: session.targetDay) else {
                quickAddError = "Enter a valid time from 0000 to 2359."
                return false
            }
            start = time
        } else {
            start = DraftTiming.getDraftTimes(targetDay: session.targetDay, now: referenceNow).start
        }
        let draft = GridEventDraft(clientId: session.id,
            schedule: .init(start: start, end: DraftTiming.timedDraftEnd(start: start), kind: .timed),
            title: digits.isEmpty ? query : "", calendarId: calendarId)
        guard let input = GridEventDraftMapping.createInput(from: draft),
              let event = GridEventDraftMapping.optimisticEvent(from: draft) else { return false }
        quickAddPanelSession?.isSaving = true
        quickAddError = nil
        defer {
            if quickAddPanelSession?.id == session.id { quickAddPanelSession?.isSaving = false }
        }
        do {
            try await eventsStore.createOptimistic(input: input, optimisticEvent: event)
            guard session.sessionRevision == sessionRevision else { return false }
            loadedEvents = try eventsStore.fetchAllEvents()
            recordCreateUndo(for: event)
            if quickAddPanelSession?.id == session.id {
                quickAddPanelSession = nil
                quickAddError = nil
            }
            rebuildPresentation()
            if !draftStore.isDrafting, viewStore.view != .life { focusEvent(eventId: event.id.rawValue) }
            return true
        } catch {
            guard session.sessionRevision == sessionRevision else { return false }
            if quickAddPanelSession?.id == session.id { quickAddError = "Could not save event. Try again." }
            reportSaveFailure(error, action: "create")
            return false
        }
    }

    public func cancelQuickAddPanelSession() {
        quickAddPanelSession = nil
        quickAddError = nil
    }
}
