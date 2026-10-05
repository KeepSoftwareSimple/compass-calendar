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
        let eventId = draft.kind == .edit
            ? (draft.sourceEventId ?? draft.clientId).rawValue
            : draft.clientId.rawValue
        return GridLayoutDraftOverlay(
            eventId: eventId,
            schedule: draft.schedule,
            title: draft.title,
            calendarId: draft.calendarId?.rawValue,
            showsInlineTitleEditor: showsInline
        )
    }

    public static func optimisticEvent(from draft: GridEventDraft, baseline: Event? = nil) -> Event? {
        guard let calendarId = draft.calendarId ?? baseline?.calendarId else { return nil }
        let now = DateTime(rawValue: CompassDateParsing.formatLikeDayjs(Date()))
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = title.isEmpty ? "Untitled event" : title
        let eventId = draft.kind == .edit ? (draft.sourceEventId ?? draft.clientId) : draft.clientId
        let recurrence = optimisticRecurrence(from: draft, baseline: baseline)
        let createdAt = baseline?.createdAt ?? now

        return Event(
            calendarId: calendarId,
            content: .details(contentPayload(from: draft, title: resolvedTitle)),
            createdAt: createdAt,
            id: eventId,
            recurrence: recurrence,
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
            content: inputContent(from: draft, title: resolvedTitle),
            id: draft.clientId,
            recurrence: createRecurrence(from: draft.recurrence),
            schedule: schedule(from: draft.schedule)
        )
    }

    public static func replaceInput(from draft: GridEventDraft, scope: ScopeEnum) -> ReplaceEventInput? {
        guard draft.kind == .edit, let calendarId = draft.calendarId else { return nil }
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = title.isEmpty ? "Untitled event" : title
        return ReplaceEventInput(
            calendarId: calendarId,
            content: inputContent(from: draft, title: resolvedTitle),
            recurrence: replaceRecurrence(from: draft.recurrence),
            schedule: schedule(from: draft.schedule),
            scope: scope
        )
    }

    private static func createRecurrence(from draft: GridEventRecurrenceDraft) -> CreateEventInputRecurrence {
        switch draft {
        case .single, .preserve:
            return .single(EventRecurrence_SinglePayload(kind: "single"))
        case .series(let rules):
            return .series(EventRecurrence_SeriesPayload(kind: "series", rules: rules))
        }
    }

    private static func replaceRecurrence(from draft: GridEventRecurrenceDraft) -> ReplaceEventInputRecurrence {
        switch draft {
        case .preserve:
            return .preserve(ReplaceEventInputRecurrence_PreservePayload(kind: "preserve"))
        case .single:
            return .single(EventRecurrence_SinglePayload(kind: "single"))
        case .series(let rules):
            return .series(EventRecurrence_SeriesPayload(kind: "series", rules: rules))
        }
    }

    private static func optimisticRecurrence(from draft: GridEventDraft, baseline: Event?) -> EventRecurrence {
        switch draft.recurrence {
        case .preserve:
            return baseline?.recurrence ?? .single(EventRecurrence_SinglePayload(kind: "single"))
        case .single:
            return .single(EventRecurrence_SinglePayload(kind: "single"))
        case .series(let rules):
            return .series(EventRecurrence_SeriesPayload(kind: "series", rules: rules))
        }
    }

    private static func inputContent(from draft: GridEventDraft, title: String) -> CreateEventInputContent {
        CreateEventInputContent(
            color: draft.color.flatMap { ColorEnum(rawValue: $0.rawValue) },
            description: draft.description,
            kind: "details",
            location: draft.location,
            title: title
        )
    }

    private static func contentPayload(from draft: GridEventDraft, title: String) -> EventContent_DetailsPayload {
        EventContent_DetailsPayload(
            color: draft.color.flatMap { ColorEnum(rawValue: $0.rawValue) },
            description: draft.description,
            kind: "details",
            location: draft.location.isEmpty ? nil : draft.location,
            title: title
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
