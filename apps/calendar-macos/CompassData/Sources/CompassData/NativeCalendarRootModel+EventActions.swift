import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var clipboardStore: ClipboardStore { environment.clipboardStore }
    public var undoStore: UndoStore { environment.undoStore }
    public var statusToastStore: StatusToastStore { overlayStores.statusToast }
    public var eventMenuStore: EventMenuStore { overlayStores.eventMenu }
    public var recurrenceScopeStore: RecurrenceScopeStore { overlayStores.recurrenceScope }

    public var editSequenceMenuVisible: Bool {
        overlayStores.editSequenceMenuVisible
    }

    public func syncEditSequencePhase(_ phase: LeaderSequencePhase) {
        overlayStores.editSequenceMenuVisible = {
            if case .armedWithMenu = phase { return true }
            return false
        }()
    }

    public func focusedEvent() -> Event? {
        guard let id = focusStore.focusedEventId else { return nil }
        return loadedEvents.first { $0.id == id }
    }

    public func event(for id: EventId) -> Event? {
        loadedEvents.first { $0.id == id }
    }

    public func isReadOnly(event: Event) -> Bool {
        EventInteractionPolicy.isReadOnly(event: event, calendars: calendars)
    }

    public func isEventHidden(eventId: EventId) -> Bool {
        environment.hiddenEventsStore.isHidden(eventId)
    }

    public func openEventMenu(fromKeyboard: Bool = true, anchor: CGPoint? = nil) {
        guard viewStore.view != .life else { return }
        guard let event = focusedEvent() else { return }
        overlayStores.legend.close()
        overlayStores.palette.close()
        eventMenuStore.open(eventId: event.id, anchor: anchor)
        if fromKeyboard {
            recordShortcut(.editMenu)
        }
    }

    public func closeEventMenu() {
        eventMenuStore.close()
    }

    public func toggleFocusedEventHidden() {
        guard let event = focusedEvent() else { return }
        toggleEventHidden(eventId: event.id)
        recordShortcut(.editHide)
    }

    public func toggleEventHidden(eventId: EventId) {
        let hidden = environment.hiddenEventsStore.isHidden(eventId)
        let next = !hidden
        Task {
            let beforeHidden = hidden
            do {
                try await environment.hiddenEventsStore.setEventHidden(eventId: eventId, hidden: next)
                if !undoStore.isRestoringHistory() {
                    undoStore.record(.hidden(eventId: eventId, hidden: next))
                }
                rebuildPresentation()
                if beforeHidden != next {
                    statusToastStore.show(
                        id: "hidden-event",
                        message: next ? "Event hidden" : "Event shown")
                }
            } catch {
                statusToastStore.show(id: "hidden-event-error", message: "Could not update hidden state")
            }
        }
    }

    public func copyFocusedEvent() {
        guard let event = focusedEvent() else { return }
        clipboardStore.copy(event)
        recordShortcut(.editCopy)
    }

    public func pasteCopiedEvent() {
        guard viewStore.view != .life, let source = clipboardStore.event else { return }
        let sourceDay = EventOnTargetDay.startDay(for: source)
        let targetDay = draftTargetDay()
        let adjusted = EventOnTargetDay.moved(source, to: targetDay)
        Task { await commitDuplicate(from: adjusted, recordUndo: true) }
        recordShortcut(.editPaste)
    }

    public func duplicateFocusedEvent() {
        guard let event = focusedEvent(),
              !EventInteractionPolicy.isReadOnly(event: event, calendars: calendars)
        else { return }
        Task { await commitDuplicate(from: event, recordUndo: true) }
        recordShortcut(.editDuplicate)
    }

    public func deleteFocusedEvent() {
        guard let event = focusedEvent(),
              !EventInteractionPolicy.isReadOnly(event: event, calendars: calendars)
        else { return }
        Task { await deleteEvent(event, scope: .this) }
        recordShortcut(.editDelete)
    }

    public func promptEventMenuKeyboardOnly(label: String, keycaps: [String]) {
        let keys = keycaps.joined(separator: "+")
        statusToastStore.show(
            id: "context-menu-keyboard-only",
            message: "Use \(keys) to \(label.lowercased())")
    }

    func commitDuplicate(from source: Event, recordUndo: Bool) async {
        guard let input = EventDuplicateCommit.duplicateInput(
            from: source,
            calendars: calendars,
            defaultCalendarId: defaultTargetCalendarId()
        ), let optimistic = EventDuplicateCommit.optimisticEvent(from: input) else { return }

        do {
            try await eventsStore.createOptimistic(input: input, optimisticEvent: optimistic)
            loadedEvents = try eventsStore.fetchAllEvents()
            if recordUndo, !undoStore.isRestoringHistory() {
                undoStore.record(.create(event: optimistic))
            }
            rebuildPresentation()
            focusEvent(eventId: optimistic.id.rawValue)
        } catch {}
    }

    /// Re-reads the store after a write so the grid reflects what persisted,
    /// not just the optimistic edit. A read failure leaves the optimistic
    /// `loadedEvents` in place rather than blanking the grid.
    private func refreshLoadedEvents() {
        if let events = try? eventsStore.fetchAllEvents() {
            loadedEvents = events
        }
    }

    private func clearFocusIfShowing(eventId: EventId) {
        guard focusStore.focusedEventId == eventId else { return }
        focusStore.setFocused(eventId: nil, eventType: nil)
    }

    /// Undoes a create: drop the row, resync, and give up focus on it. The
    /// caller owns the `keyboardCreateSettleGeneration` bump and the staged
    /// delete, which differ between the sync and async undo paths.
    private func revertCreatedEvent(_ event: Event) {
        try? eventsStore.removePersistedEvent(id: event.id)
        loadedEvents.removeAll { $0.id == event.id }
        refreshLoadedEvents()
        clearFocusIfShowing(eventId: event.id)
        rebuildPresentation()
    }

    private func applyHiddenState(eventId: EventId, hidden: Bool) async {
        try? await environment.hiddenEventsStore.setEventHidden(eventId: eventId, hidden: hidden)
        refreshLoadedEvents()
        rebuildPresentation()
    }

    func deleteEvent(_ event: Event, scope: EventDeleteScope) async {
        let undoable =
            UndoStore.isUndoableRecurrence(event) && scope == .this
        let snapshot = event
        do {
            try await eventsStore.deleteOptimistic(id: event.id, scope: scope)
        } catch {}
        loadedEvents.removeAll { $0.id == event.id }
        refreshLoadedEvents()
        clearFocusIfShowing(eventId: event.id)
        if !undoStore.isRestoringHistory() {
            if undoable {
                undoStore.record(.delete(event: snapshot))
            } else if scope == .this {
                undoStore.record(.unrecorded)
            }
        }
        rebuildPresentation()
        if EventInteractionPolicy.isOccurrenceThisScopeAsk(event: event, scope: scope) {
            _ = recurrenceScopeStore.beginDeleteAsk(for: event)
            statusToastStore.show(id: "recurrence-scope", message: "Deleted. Apply to series? Press 1 for following, 2 for all.")
        }
    }

    public func promotePendingDelete(scope: RecurrenceScopePromotionKind) {
        guard let pending = recurrenceScopeStore.pendingDelete else { return }
        recurrenceScopeStore.clear(opportunityId: pending.opportunityId)
        statusToastStore.clear()
        let mapped: EventDeleteScope = scope == .all ? .all : .thisAndFollowing
        Task {
            await deleteEvent(pending.event, scope: mapped)
        }
    }

    public func undoLastChange() {
        Task { await undoLastChangeAndWait() }
    }

    /// Grid Cmd+Z after keyboard create: undo must update the native grid before the next XCUITest assertion.
    public func undoKeyboardPlacedCreateNow() {
        guard case .create(let event)? = undoStore.peekUndo() else {
            statusToastStore.show(id: "undo-status", message: "Nothing to undo")
            return
        }
        keyboardCreateSettleGeneration += 1
        undoStore.commitUndo()
        undoStore.runHistoryRestore {
            revertCreatedEvent(event)
        }
        recordShortcut(.otherUndo)
        Task { await eventsStore.settleStagedDelete(id: event.id, scope: .this) }
    }

    public func undoLastChangeAndWait() async {
        guard let entry = undoStore.peekUndo() else {
            statusToastStore.show(id: "undo-status", message: "Nothing to undo")
            return
        }
        if case .unrecorded = entry {
            undoStore.commitUndo()
            statusToastStore.show(id: "undo-status", message: "Can't undo the last change")
            return
        }
        undoStore.commitUndo()
        await undoStore.runHistoryRestoreAsync {
            await self.replayUndoEntry(entry)
        }
        recordShortcut(.otherUndo)
    }

    public func redoLastChange() {
        guard let entry = undoStore.peekRedo() else {
            statusToastStore.show(id: "undo-status", message: "Nothing to redo")
            return
        }
        undoStore.commitRedo()
        Task {
            await undoStore.runHistoryRestoreAsync {
                await self.replayRedoEntry(entry)
            }
        }
        recordShortcut(.otherRedo)
    }

    private func replayUndoEntry(_ entry: UndoHistoryEntry) async {
        switch entry {
        case .create(let event):
            keyboardCreateSettleGeneration += 1
            revertCreatedEvent(event)
            await eventsStore.settleStagedDelete(id: event.id, scope: .this)
        case .delete(let event):
            await commitDuplicate(from: event, recordUndo: false)
        case .edit(_, let before, _):
            await replaceEvent(with: before)
        case .hidden(let eventId, let hidden):
            await applyHiddenState(eventId: eventId, hidden: !hidden)
        case .unrecorded:
            break
        }
    }

    private func replayRedoEntry(_ entry: UndoHistoryEntry) async {
        switch entry {
        case .create(let event):
            await commitDuplicate(from: event, recordUndo: false)
        case .delete(let event):
            await deleteEvent(event, scope: .this)
        case .edit(_, _, let after):
            await replaceEvent(with: after)
        case .hidden(let eventId, let hidden):
            await applyHiddenState(eventId: eventId, hidden: hidden)
        case .unrecorded:
            break
        }
    }

    private func replaceEvent(with event: Event) async {
        // Form-less grid: full replace parity deferred; keep undo stack honest for creates/deletes/hidden.
    }

    public func recordCreateUndo(for event: Event) {
        guard !undoStore.isRestoringHistory() else { return }
        undoStore.record(.create(event: event))
    }
}
