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
        let recurrence = optimisticRecurrence(from: draft, baseline: baseline)
        let createdAt = baseline?.createdAt ?? now
        let editedBaseline = draft.kind == .edit ? baseline : nil

        return Event(
            calendarId: calendarId,
            content: .details(contentPayload(from: draft, title: resolvedTitle, baseline: baseline)),
            createdAt: createdAt,
            icalUid: editedBaseline?.icalUid,
            id: eventId,
            popupReminderMinutes: editedBaseline?.popupReminderMinutes,
            providerManaged: editedBaseline?.providerManaged,
            recurrence: recurrence,
            schedule: schedule(from: draft.schedule, timeZone: draft.timeZone),
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
            recurrence: createRecurrence(from: draft.recurrence),
            schedule: schedule(from: draft.schedule, timeZone: draft.timeZone)
        )
    }

    public static func replaceInput(
        from draft: GridEventDraft,
        originalCalendarId: CalendarId,
        scope: ScopeEnum,
        baseline: Event? = nil,
        invitation: InvitationEnum? = nil
    ) -> ReplaceEventInput? {
        guard draft.kind == .edit, let calendarId = draft.calendarId else { return nil }
        let resolvedTitle = resolvedTitle(from: draft)
        let wireSchedule = schedule(from: draft.schedule, timeZone: draft.timeZone)
        let includeSchedule =
            baseline == nil || !schedulesEqual(baseline!.schedule, wireSchedule)
        return ReplaceEventInput(
            calendarId: calendarId == originalCalendarId ? nil : calendarId,
            content: inputContent(from: draft, title: resolvedTitle),
            invitation: invitation,
            recurrence: replaceRecurrence(from: draft.recurrence),
            schedule: includeSchedule ? wireSchedule : nil,
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

    private static func contentPayload(
        from draft: GridEventDraft, title: String, baseline: Event?
    ) -> EventContent_DetailsPayload {
        let existing: EventContent_DetailsPayload?
        if draft.kind == .edit, case .details(let details) = baseline?.content {
            existing = details
        } else {
            existing = nil
        }
        let attendees: [EventContentDetailsAttendees]? = draft.attendees?.map { attendee in
            EventContentDetailsAttendees(
                displayName: attendee.displayName,
                email: attendee.email,
                responseStatus: existing?.attendees?.first { $0.email == attendee.email }?.responseStatus ?? .needsAction
            )
        }
        return EventContent_DetailsPayload(
            attendees: attendees,
            color: draftColorEnum(draft),
            colorHex: draft.color == nil ? existing?.colorHex : nil,
            conference: existing?.conference,
            description: draft.description,
            kind: "details",
            location: draft.location.isEmpty ? nil : draft.location,
            organizer: existing?.organizer,
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

    private static func schedulesEqual(_ left: EventSchedule, _ right: EventSchedule) -> Bool {
        switch (left, right) {
        case (.allDay(let a), .allDay(let b)):
            return a.start == b.start && a.end == b.end
        case (.timed(let a), .timed(let b)):
            let leftStart = CompassDateParsing.parseInEffectiveTimeZone(a.start.rawValue)
            let rightStart = CompassDateParsing.parseInEffectiveTimeZone(b.start.rawValue)
            let leftEnd = CompassDateParsing.parseInEffectiveTimeZone(a.end.rawValue)
            let rightEnd = CompassDateParsing.parseInEffectiveTimeZone(b.end.rawValue)
            return leftStart == rightStart && leftEnd == rightEnd
        default:
            return false
        }
    }

    private static func schedule(from draftSchedule: DraftSchedule, timeZone: IANATimeZone?) -> EventSchedule {
        switch draftSchedule.kind {
        case .timed:
            return .timed(
                EventSchedule_TimedPayload(
                    end: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(draftSchedule.end)),
                    kind: "timed",
                    start: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(draftSchedule.start)),
                    timeZone: timeZone ?? IANATimeZone(rawValue: EffectiveTimeZone.identifier)
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
