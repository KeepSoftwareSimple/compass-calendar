import CompassKit
import Foundation

extension NativeCalendarRootModel {
    /// Shift+arrow nudge for a focused saved event (no grid draft).
    @discardableResult
    func nudgeFocusedSavedEvent(key: String, altKey: Bool) -> Bool {
        guard viewStore.view != .life else { return false }
        guard draftStore.gridDraft == nil else { return false }
        guard !isEventFormVisible else { return false }
        guard let event = focusedEvent(), case .details = event.content else { return false }
        guard !isReadOnly(event: event) else { return false }
        guard !isFocusedSavedEventScheduleLocked(event) else { return false }
        guard let current = GridEventDraftFromEvent.draftSchedule(from: event) else { return false }

        let step = DraftNudge.nudgeStepFromKeyboard(altKey: altKey)
        let isStartAllowed: (Date) -> Bool = { [weak self] nextStart in
            guard let self else { return false }
            let calendar = EffectiveTimeZone.calendar
            let start = calendar.startOfDay(for: nextStart)
            let viewStart = calendar.startOfDay(for: self.startOfView)
            let viewEnd = calendar.startOfDay(for: self.endOfView)
            return start >= viewStart && start <= viewEnd
        }

        let before = event
        let nextSchedule: DraftSchedule
        let nextEdge: EventEdge?

        if let edge = focusStore.edge {
            guard let result = DraftNudge.nudgeScheduleEdgeByKeyboard(
                schedule: current,
                edge: edge.scheduleEdge,
                key: key,
                step: step
            ) else {
                return false
            }
            nextSchedule = result.schedule
            nextEdge = EventEdge(result.edge)
        } else {
            guard let moved = DraftNudge.nudgeScheduleByKeyboard(
                schedule: current,
                key: key,
                isStartAllowed: isStartAllowed,
                step: step
            ) else {
                return false
            }
            nextSchedule = moved
            nextEdge = nil
        }

        let nudged = LocalEventExpansion.copy(
            event,
            schedule: EventScheduleDraftMapping.eventSchedule(from: nextSchedule, event: event)
        )

        if let index = loadedEvents.firstIndex(where: { $0.id == nudged.id }) {
            loadedEvents[index] = nudged
        }

        if let nextEdge {
            focusStore.setEdge(
                eventId: nudged.id,
                edge: nextEdge,
                announcement: focusStore.edgeAnnouncement,
                isAllDay: focusStore.edgeFocusIsAllDay
            )
        }

        if !undoStore.isRestoringHistory() {
            if UndoStore.isUndoableRecurrence(before), UndoStore.isUndoableRecurrence(nudged) {
                undoStore.record(.edit(id: before.id, before: before, after: nudged))
            } else {
                undoStore.record(.unrecorded)
            }
        }

        let revision = sessionRevision
        Task {
            await self.replaceEventSchedule(nudged, revision: revision)
        }
        return true
    }

    func isFocusedSavedEventScheduleLocked(_ event: Event) -> Bool {
        let isBusy: Bool = {
            if case .busy = event.content { return true }
            return false
        }()
        let lookup = CalendarLookupBuilder.build(calendars)
        return GridEventAccess.isGridEventScheduleLocked(
            lookup: lookup,
            calendarId: event.calendarId,
            isBusy: isBusy,
            isProviderManaged: event.providerManaged == true
        )
    }

    private func replaceEventSchedule(_ event: Event, revision: Int) async {
        guard revision == sessionRevision else { return }
        await replaceEvent(with: event)
    }
}
