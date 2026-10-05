// Mirrors `apps/calendar-web/src/events/stores/draft.store.ts` and keyboard nudge
// helpers in `apps/calendar-web/src/common/utils/draft/reposition-draft-by-keyboard.util.ts`.

import CompassKit
import Foundation

public struct DraftStatus: Sendable, Equatable {
    public var activity: DraftNudgeActivity?
    public var isDrafting: Bool
    public var isFormOpen: Bool

    public init(
        activity: DraftNudgeActivity? = nil,
        isDrafting: Bool = false,
        isFormOpen: Bool = false
    ) {
        self.activity = activity
        self.isDrafting = isDrafting
        self.isFormOpen = isFormOpen
    }
}

private let opensFormOnStart: Set<DraftNudgeActivity> = [
    .createShortcut,
    .gridClick,
    .keyboardEdit,
]

@MainActor
@Observable
public final class DraftStore {
    public private(set) var status: DraftStatus = DraftStatus()
    public private(set) var gridDraft: GridEventDraft?
    public private(set) var quickTimeDigits: String = ""
    /// Snapshot when the form opened, for unsaved-changes detection.
    public private(set) var formBaseline: GridEventDraft?

    public init() {}

    public var isDrafting: Bool { status.isDrafting }

    public func discard() {
        status = DraftStatus()
        gridDraft = nil
        quickTimeDigits = ""
        formBaseline = nil
    }

    public func startGridDraft(activity: DraftNudgeActivity, draft: GridEventDraft) {
        gridDraft = draft
        let formOpen = opensFormOnStart.contains(activity)
        status = DraftStatus(
            activity: activity,
            isDrafting: true,
            isFormOpen: formOpen
        )
        if formOpen {
            formBaseline = draft
        }
    }

    public func setGridDraft(_ draft: GridEventDraft?) {
        guard let draft else {
            discard()
            return
        }
        gridDraft = draft
        if !status.isDrafting {
            status.isDrafting = true
        }
    }

    public func setGridSchedule(_ schedule: DraftSchedule?) {
        guard let schedule, var draft = gridDraft else {
            discard()
            return
        }
        draft.schedule = schedule
        gridDraft = draft
        if !status.isDrafting {
            status.isDrafting = true
        }
    }

    public func setTitle(_ title: String) {
        guard var draft = gridDraft else { return }
        draft.title = title
        gridDraft = draft
    }

    public func setFormOpen(_ isFormOpen: Bool) {
        guard status.isFormOpen != isFormOpen else { return }
        status.isFormOpen = isFormOpen
        if isFormOpen, let draft = gridDraft {
            formBaseline = draft
        }
        if !isFormOpen {
            formBaseline = nil
        }
    }

    public func setQuickTimeDigits(_ digits: String) {
        quickTimeDigits = digits
    }

    public func commit() {
        discard()
    }

    public var hasUnsavedFormChanges: Bool {
        guard status.isFormOpen, let draft = gridDraft, let baseline = formBaseline else {
            return false
        }
        return draft != baseline
    }

    /// Arrow-key nudge through the shared CompassKit draft nudge engine.
    @discardableResult
    public func nudgeByKeyboard(
        key: String,
        altKey: Bool = false,
        isStartAllowed: ((Date) -> Bool)? = nil
    ) -> DraftSchedule? {
        let step = DraftNudge.nudgeStepFromKeyboard(altKey: altKey)
        guard let next = DraftNudge.repositionDraftByKeyboard(
            activity: status.activity,
            schedule: gridDraft?.schedule,
            key: key,
            isStartAllowed: isStartAllowed,
            step: step
        ) else {
            return nil
        }
        setGridSchedule(next)
        return next
    }
}
