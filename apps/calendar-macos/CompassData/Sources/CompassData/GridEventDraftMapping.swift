import CompassKit
import Foundation

public enum GridEventDraftMapping {
    public static func overlay(
        from draft: GridEventDraft,
        activity: DraftNudgeActivity,
        status: DraftStatus
    ) -> GridLayoutDraftOverlay {
        let showsInline =
            activity == .keyboardPlace && !status.isFormOpen
        return GridLayoutDraftOverlay(
            eventId: draft.clientId.rawValue,
            schedule: draft.schedule,
            title: draft.title,
            calendarId: draft.calendarId?.rawValue,
            showsInlineTitleEditor: showsInline
        )
    }

    public static func optimisticEvent(from draft: GridEventDraft) -> Event? {
        guard let calendarId = draft.calendarId else { return nil }
        let now = DateTime(rawValue: CompassDateParsing.formatLikeDayjs(Date()))
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = title.isEmpty ? "Untitled event" : title

        return Event(
            calendarId: calendarId,
            content: .details(
                EventContent_DetailsPayload(
                    description: "",
                    kind: "details",
                    location: nil,
                    title: resolvedTitle
                )
            ),
            createdAt: now,
            id: draft.clientId,
            recurrence: .single(EventRecurrence_SinglePayload(kind: "single")),
            schedule: schedule(from: draft.schedule),
            updatedAt: now
        )
    }

    public static func createInput(from draft: GridEventDraft) -> CreateEventInput? {
        guard let calendarId = draft.calendarId else { return nil }
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = title.isEmpty ? "Untitled event" : title

        return CreateEventInput(
            calendarId: calendarId,
            content: CreateEventInputContent(
                description: "",
                kind: "details",
                location: "",
                title: resolvedTitle
            ),
            id: draft.clientId,
            recurrence: .single(EventRecurrence_SinglePayload(kind: "single")),
            schedule: schedule(from: draft.schedule)
        )
    }

    private static func schedule(from draftSchedule: DraftSchedule) -> EventSchedule {
        switch draftSchedule.kind {
        case .timed:
            return .timed(
                EventSchedule_TimedPayload(
                    end: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(draftSchedule.end)),
                    kind: "timed",
                    start: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(draftSchedule.start)),
                    timeZone: IANATimeZone(rawValue: EffectiveTimeZone.identifier)
                )
            )
        case .allDay:
            return .allDay(
                EventSchedule_AllDayPayload(
                    end: CompassDateParsing.formatCalendarDay(draftSchedule.end),
                    kind: "allDay",
                    start: CompassDateParsing.formatCalendarDay(draftSchedule.start)
                )
            )
        }
    }
}
