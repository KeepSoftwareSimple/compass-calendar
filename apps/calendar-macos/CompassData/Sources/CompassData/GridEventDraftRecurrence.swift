import CompassKit
import Foundation

public enum GridEventDraftRecurrence {
    public static func resolvedRules(
        draft: GridEventDraft,
        baselineEvent: Event?,
        seriesMaster: Event?
    ) -> [String] {
        switch draft.recurrence {
        case .single:
            return []
        case .series(let rules):
            return rules
        case .preserve:
            guard let baselineEvent else { return [] }
            switch baselineEvent.recurrence {
            case .series(let payload):
                return payload.rules
            case .occurrence:
                if case .series(let master) = seriesMaster?.recurrence {
                    return master.rules
                }
                return []
            case .single:
                return []
            }
        }
    }

    public static func recurrenceKindLabel(_ draft: GridEventRecurrenceDraft) -> String {
        switch draft {
        case .single: "single"
        case .series: "series"
        case .preserve: "preserve"
        }
    }

    public static func saveDecisionInput(
        draft: GridEventDraft,
        baselineEvent: Event?,
        seriesMaster: Event?
    ) -> RecurrenceScopeDecisionLogic.SaveInput {
        let isInstance: Bool = {
            guard let baselineEvent else { return false }
            if case .occurrence = baselineEvent.recurrence { return true }
            return false
        }()
        let isRecurring = RecurrenceScopeDecisionLogic.isExistingEventRecurring(baselineEvent) || isInstance
        let explicitRules: [String]? = {
            if case .series(let rules) = draft.recurrence { return rules }
            return nil
        }()
        return RecurrenceScopeDecisionLogic.SaveInput(
            isEditDraft: draft.kind == .edit,
            draftRecurrenceKind: recurrenceKindLabel(draft.recurrence),
            explicitSeriesRules: explicitRules,
            schedule: draft.schedule,
            baselineEvent: baselineEvent,
            seriesMaster: seriesMaster,
            isRecurring: isRecurring,
            isInstance: isInstance
        )
    }

    public static func resolveSaveDecision(
        draft: GridEventDraft,
        baselineEvent: Event?,
        seriesMaster: Event?
    ) -> RecurrenceScopeDecision {
        RecurrenceScopeDecisionLogic.resolveSave(
            saveDecisionInput(
                draft: draft,
                baselineEvent: baselineEvent,
                seriesMaster: seriesMaster
            )
        )
    }
}
