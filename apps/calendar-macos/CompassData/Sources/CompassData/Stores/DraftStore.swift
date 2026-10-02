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
    public private(set) var gridSchedule: DraftSchedule?
    public private(set) var quickTimeDigits: String = ""

    public init() {}

    public var isDrafting: Bool { status.isDrafting }

    public func discard() {
        status = DraftStatus()
        gridSchedule = nil
        quickTimeDigits = ""
    }

    public func startGridDraft(activity: DraftNudgeActivity, schedule: DraftSchedule) {
        gridSchedule = schedule
        status = DraftStatus(
            activity: activity,
            isDrafting: true,
            isFormOpen: opensFormOnStart.contains(activity)
        )
    }

    public func setGridSchedule(_ schedule: DraftSchedule?) {
        guard let schedule else {
            discard()
            return
        }
        gridSchedule = schedule
        if !status.isDrafting {
            status.isDrafting = true
        }
    }

    public func setFormOpen(_ isFormOpen: Bool) {
        guard status.isFormOpen != isFormOpen else { return }
        status.isFormOpen = isFormOpen
    }

    public func setQuickTimeDigits(_ digits: String) {
        quickTimeDigits = digits
    }

    public func commit() {
        discard()
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
            schedule: gridSchedule,
            key: key,
            isStartAllowed: isStartAllowed,
            step: step
        ) else {
            return nil
        }
        gridSchedule = next
        if !status.isDrafting {
            status.isDrafting = true
        }
        return next
    }
}
