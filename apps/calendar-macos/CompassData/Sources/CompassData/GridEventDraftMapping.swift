import CompassKit
import Foundation

public enum GridEventDraftMapping {
    public static func overlay(
        from draft: GridEventDraft,
        activity: DraftNudgeActivity,
        status: DraftStatus,
        sourceColorHex: String? = nil
    ) -> GridLayoutDraftOverlay {
        let showsInline =
            activity == .keyboardPlace && !status.isFormOpen
        let eventId = wireEventId(from: draft).rawValue
        let colorHex = draft.color == nil ? sourceColorHex : nil
        return GridLayoutDraftOverlay(
            eventId: eventId,
            schedule: draft.schedule,
            title: draft.title,
            calendarId: draft.calendarId?.rawValue,
            colorHex: colorHex,
            showsInlineTitleEditor: showsInline
        )
    }

    public static func optimisticEvent(from draft: GridEventDraft, baseline: Event? = nil) -> Event? {
        guard let calendarId = draft.calendarId ?? baseline?.calendarId else { return nil }
        let now = DateTime(rawValue: CompassDateParsing.formatLikeDayjs(Date()))
        let resolvedTitle = resolvedTitle(from: draft)
        let eventId = wireEventId(from: draft)
        let recurrence = baseline?.recurrence ?? .single(EventRecurrence_SinglePayload(kind: "single"))
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

    public static func createInput(
        from draft: GridEventDraft,
        invitation: InvitationEnum? = nil
    ) -> CreateEventInput? {
        guard let calendarId = draft.calendarId else { return nil }
        let resolvedTitle = resolvedTitle(from: draft)
        let createConference = draft.createConference ? true : nil

        return CreateEventInput(
            calendarId: calendarId,
            content: inputContent(from: draft, title: resolvedTitle),
            createConference: createConference,
            id: draft.clientId,
            invitation: invitation,
            recurrence: .single(EventRecurrence_SinglePayload(kind: "single")),
            schedule: schedule(from: draft.schedule)
        )
    }

    public static func replaceInput(
        from draft: GridEventDraft,
        invitation: InvitationEnum? = nil
    ) -> ReplaceEventInput? {
        guard draft.kind == .edit, let calendarId = draft.calendarId else { return nil }
        let resolvedTitle = resolvedTitle(from: draft)
        return ReplaceEventInput(
            calendarId: calendarId,
            content: inputContent(from: draft, title: resolvedTitle),
            invitation: invitation,
            recurrence: .preserve(ReplaceEventInputRecurrence_PreservePayload(kind: "preserve")),
            schedule: schedule(from: draft.schedule),
            scope: .this
        )
    }

    private static func inputContent(from draft: GridEventDraft, title: String) -> CreateEventInputContent {
        let wireAttendees = draft.attendees?.map { $0.toOrganizerWire() }
        return CreateEventInputContent(
            attendees: wireAttendees,
            color: draftColorEnum(draft),
            description: draft.description,
            kind: "details",
            location: draft.location,
            title: title
        )
    }

    private static func contentPayload(from draft: GridEventDraft, title: String) -> EventContent_DetailsPayload {
        let attendees: [EventContentDetailsAttendees]? = draft.attendees?.map {
            EventContentDetailsAttendees(
                displayName: $0.displayName,
                email: $0.email,
                responseStatus: .needsAction
            )
        }
        return EventContent_DetailsPayload(
            attendees: attendees,
            color: draftColorEnum(draft),
            description: draft.description,
            kind: "details",
            location: draft.location.isEmpty ? nil : draft.location,
            title: title
        )
    }

    private static func resolvedTitle(from draft: GridEventDraft) -> String {
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? "Untitled event" : title
    }

    private static func wireEventId(from draft: GridEventDraft) -> EventId {
        draft.kind == .edit ? (draft.sourceEventId ?? draft.clientId) : draft.clientId
    }

    private static func draftColorEnum(_ draft: GridEventDraft) -> ColorEnum? {
        draft.color.flatMap { ColorEnum(rawValue: $0.rawValue) }
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
