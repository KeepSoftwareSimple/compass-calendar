import CompassKit
import Foundation

public enum RecurrenceScopePromptKind: String, Sendable, Equatable {
    case save
    case delete
}

extension NativeCalendarRootModel {
    public func seriesMaster(for event: Event) -> Event? {
        switch event.recurrence {
        case .occurrence(let payload):
            return loadedEvents.first { $0.id == payload.seriesId }
        case .series:
            return event
        case .single:
            return nil
        }
    }

    public func updateDraftRecurrence(_ recurrence: GridEventRecurrenceDraft) {
        guard var draft = draftStore.gridDraft else { return }
        draft.recurrence = recurrence
        draftStore.setGridDraft(draft)
        rebuildPresentation()
    }

    public func cancelRecurrenceScopePrompt() {
        pendingRecurrenceScopePrompt = nil
        onRecurrenceScopeAccessibilityProbeChanged?(false)
    }

    public func cancelConvertToStandaloneConfirmation() {
        pendingConvertToStandaloneConfirmation = false
    }

    public func confirmConvertToStandalone() async {
        pendingConvertToStandaloneConfirmation = false
        guard var draft = draftStore.gridDraft else { return }
        draft.recurrence = .single
        draftStore.setGridDraft(draft)
        await commitSaveDraft(scope: .all)
    }

    public func confirmRecurrenceScope(_ scope: ScopeEnum) async {
        let kind = pendingRecurrenceScopePrompt
        pendingRecurrenceScopePrompt = nil
        onRecurrenceScopeAccessibilityProbeChanged?(false)
        guard let kind else { return }
        switch kind {
        case .save:
            await commitSaveDraft(scope: scope)
        case .delete:
            await commitDeleteFormEvent(scope: deleteScope(from: scope))
        }
    }

    public func requestSaveDraft() async {
        guard let draft = draftStore.gridDraft else { return }
        let baseline = baselineEvent(for: draft)
        let resolvedSeriesMaster = baseline.flatMap { seriesMaster(for: $0) }
        let decision = GridEventDraftRecurrence.resolveSaveDecision(
            draft: draft,
            baselineEvent: baseline,
            seriesMaster: resolvedSeriesMaster
        )
        switch decision {
        case .convertToStandalone:
            pendingConvertToStandaloneConfirmation = true
            return
        case .apply(let scope):
            if shouldAskRecurrenceScopeOnSave(draft: draft, baseline: baseline) {
                pendingRecurrenceScopePrompt = .save
                onRecurrenceScopeAccessibilityProbeChanged?(true)
                return
            }
            await commitSaveDraft(scope: scope)
        }
    }

    public func requestDeleteFormEvent() async {
        guard let draft = draftStore.gridDraft,
            draft.kind == .edit,
            draft.persistedEventId != nil
        else { return }
        let baseline = baselineEvent(for: draft)
        if RecurrenceScopeDecisionLogic.isExistingEventRecurring(baseline) {
            pendingRecurrenceScopePrompt = .delete
            onRecurrenceScopeAccessibilityProbeChanged?(true)
            return
        }
        await commitDeleteFormEvent(scope: .this)
    }

    func commitSaveDraft(scope: ScopeEnum) async {
        guard let draft = draftStore.gridDraft else { return }
        let baseline = baselineEvent(for: draft)
        let savedId: String

        switch draft.kind {
        case .create:
            guard let input = GridEventDraftMapping.createInput(from: draft),
                let optimistic = GridEventDraftMapping.optimisticEvent(from: draft, baseline: baseline)
            else { return }
            savedId = optimistic.id.rawValue
            draftStore.commit()
            formFieldDigitHintsVisible = false
            rebuildPresentation()
            do {
                try await eventsStore.createOptimistic(input: input, optimisticEvent: optimistic)
                loadedEvents = try eventsStore.fetchAllEvents()
                rebuildPresentation()
                focusEvent(eventId: savedId)
            } catch {}
        case .edit:
            guard let eventId = draft.persistedEventId,
                let input = GridEventDraftMapping.replaceInput(from: draft, scope: scope),
                let optimistic = GridEventDraftMapping.optimisticEvent(from: draft, baseline: baseline)
            else { return }
            savedId = eventId.rawValue
            draftStore.commit()
            formFieldDigitHintsVisible = false
            rebuildPresentation()
            do {
                try await eventsStore.replaceOptimistic(
                    id: eventId,
                    input: input,
                    optimisticEvent: optimistic
                )
                loadedEvents = try eventsStore.fetchAllEvents()
                rebuildPresentation()
                focusEvent(eventId: savedId)
            } catch {}
        }
    }

    func commitDeleteFormEvent(scope: EventDeleteScope, eventId: EventId? = nil) async {
        guard let draft = draftStore.gridDraft,
            draft.kind == .edit,
            let resolvedId = eventId ?? draft.persistedEventId
        else { return }
        draftStore.discard()
        rebuildPresentation()
        do {
            try await eventsStore.deleteOptimistic(id: resolvedId, scope: scope)
            loadedEvents = try eventsStore.fetchAllEvents()
            rebuildPresentation()
        } catch {}
    }

    private func deleteScope(from scope: ScopeEnum) -> EventDeleteScope {
        switch scope {
        case .this: .this
        case .thisAndFollowing: .thisAndFollowing
        case .all: .all
        }
    }

    private func shouldAskRecurrenceScopeOnSave(
        draft: GridEventDraft,
        baseline: Event?
    ) -> Bool {
        guard draft.kind == .edit,
              RecurrenceScopeDecisionLogic.isExistingEventRecurring(baseline)
        else {
            return false
        }
        return true
    }
}
