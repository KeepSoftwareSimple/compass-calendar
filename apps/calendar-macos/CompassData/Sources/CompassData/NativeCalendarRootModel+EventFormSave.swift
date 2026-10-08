import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public func cancelInvitationPrompt() {
        invitationPrompt = nil
        pendingInvitationDraft = nil
    }

    public func confirmInvitationSend() {
        guard pendingInvitationDraft != nil else { return }
        invitationPrompt = nil
        pendingInvitationDraft = nil
        pendingSaveInvitation = .all
        Task { await requestSaveDraft() }
    }

    public func confirmInvitationDontSend() {
        guard pendingInvitationDraft != nil else { return }
        invitationPrompt = nil
        pendingInvitationDraft = nil
        pendingSaveInvitation = .none
        Task { await requestSaveDraft() }
    }

    public func saveDraftWithInvitationGate() async {
        guard let draft = draftStore.gridDraft else { return }
        let baseline = baselineEvent(for: draft)
        if GridEventDraftGuests.guestsChanged(draft: draft, baseline: baseline) {
            let calendar = attendeeCalendar(for: draft)
            pendingInvitationDraft = draft
            invitationPrompt = EventInvitationPromptState(
                hostLabel: CalendarCapabilities.invitationHostLabel(for: calendar)
            )
            return
        }
        pendingSaveInvitation = nil
        await requestSaveDraft()
    }

    public func cancelRsvpScopeDialog() {
        pendingRsvpChoice = nil
    }

    public func confirmRsvpScope(_ scope: String) async {
        guard let pending = pendingRsvpChoice,
            let event = loadedEvents.first(where: { $0.id == pending.eventId })
        else {
            pendingRsvpChoice = nil
            return
        }
        pendingRsvpChoice = nil
        await submitRsvp(
            event: event,
            responseStatus: pending.responseStatus,
            scope: scope
        )
    }

    public func selectRsvpResponse(_ status: ResponseStatusEnum) async {
        guard let draft = draftStore.gridDraft,
            draft.kind == .edit,
            let event = baselineEvent(for: draft)
        else { return }
        let selfStatus = attendeeStatusMap(for: draft)[attendeeCalendar(for: draft)?.accountEmail?.lowercased() ?? ""]
        guard selfStatus != status else { return }
        if case .occurrence = event.recurrence {
            pendingRsvpChoice = PendingRsvpChoice(eventId: event.id, responseStatus: status)
            return
        }
        let scope = RsvpScopeWire.forEvent(recurrence: event.recurrence)
        await submitRsvp(event: event, responseStatus: status, scope: scope)
    }

    private func submitRsvp(event: Event, responseStatus: ResponseStatusEnum, scope: String) async {
        guard case .details(var payload) = event.content else { return }
        let accountEmail = calendars
            .first { $0.id == event.calendarId.rawValue }?
            .accountEmail?
            .lowercased()
        var attendees = payload.attendees ?? []
        if let accountEmail,
            let index = attendees.firstIndex(where: { $0.email.lowercased() == accountEmail })
        {
            let existing = attendees[index]
            attendees[index] = EventContentDetailsAttendees(
                displayName: existing.displayName,
                email: existing.email,
                responseStatus: responseStatus
            )
        }
        payload = EventContent_DetailsPayload(
            attendees: attendees,
            color: payload.color,
            colorHex: payload.colorHex,
            conference: payload.conference,
            description: payload.description,
            kind: payload.kind,
            location: payload.location,
            organizer: payload.organizer,
            title: payload.title
        )
        let optimistic = Event(
            calendarId: event.calendarId,
            content: .details(payload),
            createdAt: event.createdAt,
            icalUid: event.icalUid,
            id: event.id,
            providerManaged: event.providerManaged,
            recurrence: event.recurrence,
            schedule: event.schedule,
            updatedAt: event.updatedAt
        )
        do {
            try await eventsStore.rsvpOptimistic(
                id: event.id,
                responseStatus: responseStatus,
                scope: scope,
                optimisticEvent: optimistic
            )
            loadedEvents = try eventsStore.fetchAllEvents()
            rebuildPresentation()
        } catch {}
    }

    func normalizedDraftForSave(_ draft: GridEventDraft) -> GridEventDraft {
        var normalized = draft
        if normalized.createConference,
            CalendarCapabilities.creatableConferenceKind(on: attendeeCalendar(for: normalized)) == nil
        {
            normalized.createConference = false
        }
        return normalized
    }
}
