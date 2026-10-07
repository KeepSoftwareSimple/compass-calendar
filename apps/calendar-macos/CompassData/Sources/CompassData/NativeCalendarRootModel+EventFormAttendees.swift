import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var canSuggestContacts: Bool {
        syncConnectionsStore.connections.contains { $0.canSuggestContacts }
    }

    public func attendeeCalendar(for draft: GridEventDraft) -> CompassCalendar? {
        let id = draft.calendarId?.rawValue ?? defaultTargetCalendarId()?.rawValue
        guard let id else { return nil }
        return calendars.first { $0.id == id }
    }

    public func showAttendeeEditor(for draft: GridEventDraft) -> Bool {
        guard !isEventFormReadOnly(for: draft) else { return false }
        guard CalendarCapabilities.canInvite(on: attendeeCalendar(for: draft)) else { return false }
        return organizesEvent(for: draft)
    }

    public func showRsvpControl(for draft: GridEventDraft) -> Bool {
        guard draft.kind == .edit, let baseline = baselineEvent(for: draft) else { return false }
        guard case .details(let payload) = baseline.content else { return false }
        guard let accountEmail = attendeeCalendar(for: draft)?.accountEmail else { return false }
        let map = AttendeeRsvp.statusByEmail(payload.attendees)
        return map[accountEmail.lowercased()] != nil
    }

    public func showCreateConferenceToggle(for draft: GridEventDraft) -> Bool {
        draft.kind == .create
            && !isEventFormReadOnly(for: draft)
            && CalendarCapabilities.creatableConferenceKind(on: attendeeCalendar(for: draft)) != nil
    }

    public func isScheduleLocked(for draft: GridEventDraft) -> Bool {
        let access = formAccessContext(for: draft)
        return GridEventAccess.isGridEventScheduleLocked(
            lookup: access.lookup,
            calendarId: draft.calendarId,
            isBusy: access.isBusy,
            isProviderManaged: access.baseline?.providerManaged == true
        )
    }

    public func isEventFormReadOnly(for draft: GridEventDraft) -> Bool {
        let access = formAccessContext(for: draft)
        return GridEventAccess.isEventReadOnly(
            lookup: access.lookup,
            calendarId: draft.calendarId,
            isBusy: access.isBusy
        )
    }

    private func formAccessContext(for draft: GridEventDraft) -> (
        lookup: CalendarLookup,
        isBusy: Bool,
        baseline: Event?
    ) {
        let baseline = baselineEvent(for: draft)
        let isBusy = baseline.map { event in
            if case .busy = event.content { return true }
            return false
        } ?? false
        return (CalendarLookupBuilder.build(calendars), isBusy, baseline)
    }

    public func displayAttendees(for draft: GridEventDraft) -> [DraftAttendeeInput] {
        GridEventDraftGuests.displayAttendees(draft: draft, baseline: baselineEvent(for: draft))
    }

    public func attendeeStatusMap(for draft: GridEventDraft) -> [String: ResponseStatusEnum] {
        guard let baseline = baselineEvent(for: draft),
            case .details(let payload) = baseline.content
        else { return [:] }
        return AttendeeRsvp.statusByEmail(payload.attendees)
    }

    public func updateDraftAttendees(_ attendees: [DraftAttendeeInput]) {
        guard var draft = draftStore.gridDraft else { return }
        draft.attendees = attendees
        draftStore.setGridDraft(draft)
        rebuildPresentation()
    }

    public func setDraftCreateConference(_ enabled: Bool) {
        guard var draft = draftStore.gridDraft else { return }
        draft.createConference = enabled
        draftStore.setGridDraft(draft)
        rebuildPresentation()
    }

    public func scheduleAttendeeSuggestions(for query: String) {
        attendeeSuggestionQuery = query
        attendeeSuggestionTask?.cancel()
        attendeeSuggestionTask = Task { [weak self] in
            guard let self else { return }
            let results = await contactSuggestionDebouncer.suggestions(for: query)
            await MainActor.run {
                guard self.attendeeSuggestionQuery == query else { return }
                self.attendeeSuggestions = results
            }
        }
    }

    private func organizesEvent(for draft: GridEventDraft) -> Bool {
        if draft.kind == .create { return true }
        guard let baseline = baselineEvent(for: draft),
            case .details(let payload) = baseline.content
        else { return false }
        return AttendeeRsvp.organizesEvent(
            organizerEmail: payload.organizer?.email,
            calendarAccountEmail: attendeeCalendar(for: draft)?.accountEmail
        )
    }

    var contactSuggestionDebouncer: ContactSuggestionDebouncer {
        if let cached = _contactSuggestionDebouncer { return cached }
        let api = environment.apiClient
        let debouncer = ContactSuggestionDebouncer { query in
            do {
                let response = try await api.contacts.suggestions(query: query)
                let ranked = ContactSuggestionRanking.rank(response.suggestions, query: query)
                return ranked.map { DraftAttendeeInput(email: $0.email, displayName: $0.displayName) }
            } catch {
                return []
            }
        }
        _contactSuggestionDebouncer = debouncer
        return debouncer
    }
}
