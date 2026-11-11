import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var commandPaletteStore: CommandPaletteStore { overlayStores.palette }
    public var shortcutsLegendStore: ShortcutsLegendStore { overlayStores.legend }
    public var shortcutsCatalogPresenter: ShortcutsCatalogPresenting { overlayStores.catalog }

    public var overlayKeyboardCaptureActive: Bool {
        commandPaletteStore.isOpen || shortcutsLegendStore.isOpen || eventMenuStore.isOpen
            || blockPartyStore.isActive
    }

    public var blockPartyKeyboardCaptureActive: Bool {
        blockPartyStore.isActive
    }

    private var trimmedPaletteQuery: String {
        commandPaletteStore.query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func paletteSections() -> [CommandPaletteSection] {
        let query = commandPaletteStore.query
        let localHits = paletteEventHits(query: query)
        let mergedHits = mergePaletteHits(local: localHits, remote: paletteEventSearchHits)
        let meetingPage: CommandPaletteContext.MeetingPage? = if !isSignedIn || bookingStore.serverPage == nil {
            nil
        } else if bookingStore.isLive, let url = bookingStore.meetingLinkURL(calendars: calendars) {
            .live(url)
        } else {
            .setup
        }
        var sections = CommandPaletteCatalog.sections(CommandPaletteContext(
            view: viewStore.view,
            query: query,
            now: referenceNow,
            isSignedIn: isSignedIn,
            isTrialing: billingStore.status?.subscriptionStatus == .trialing,
            eventHits: mergedHits,
            recentIds: commandPaletteStore.recentCommandIds,
            tipsMuted: levelsStore.tipsMuted,
            levelHidden: levelsStore.badgeHidden,
            theme: settingsStore.theme,
            isSidebarOpen: isSidebarOpen,
            hasUpNext: upNextState.snapshot.upNext != nil,
            hasConference: upNextState.conferenceURL != nil,
            canUndo: undoStore.canUndo,
            canRedo: undoStore.canRedo,
            hasDemoEvents: hasSampleEvents,
            timeZoneAbbreviation: TimeZoneFormatting.abbreviation(for: EffectiveTimeZone.identifier),
            billingBadge: BillingPlanBadgeResolver.badge(access: billingStore.appAccess)?.label,
            meetingPage: meetingPage))
        if let eventForm = eventFormPaletteSection() {
            sections.insert(eventForm, at: min(1, sections.count))
        }
        return sections
    }

    private func eventFormPaletteSection() -> CommandPaletteSection? {
        guard draftStore.status.isFormOpen, let draft = draftStore.gridDraft else { return nil }
        let entries = EventFormActions.list(
            registry: shortcutRegistry,
            options: eventFormActionsPaletteOptions(for: draft))
        let items = entries.map { entry in
            CommandPaletteItem(
                id: EventFormActions.paletteCommandId(for: entry.id),
                label: entry.label,
                shortcut: EventFormActions.paletteShortcutString(for: entry.keycaps),
                keywords: ["event form", "sidebar", entry.label.lowercased()],
                systemImage: eventFormPaletteSystemImage(for: entry.id))
        }
        guard !items.isEmpty else { return nil }
        return CommandPaletteSection(id: "event-form", heading: "Event form", items: items)
    }

    private func eventFormPaletteSystemImage(for actionId: String) -> String {
        switch actionId {
        case "edit-copy-meeting-link", "edit-duplicate":
            return "doc.on.doc"
        case "edit-delete":
            return "trash"
        case "edit-cancel-meeting":
            return "calendar.badge.minus"
        case "edit-reschedule-meeting":
            return "arrow.triangle.2.circlepath"
        case "edit-close-form":
            return "xmark"
        default:
            return "square.and.pencil"
        }
    }

    func runEventFormPaletteCommand(_ actionId: String) {
        switch actionId {
        case "edit-save":
            Task { await saveDraft() }
        case "edit-form-actions":
            focusEventFormField(.actions)
        case "edit-toggle-all-day":
            guard let draft = draftStore.gridDraft,
                !isEventFormReadOnly(for: draft),
                !isScheduleLocked(for: draft)
            else { return }
            setDraftAllDay(draft.schedule.kind != .allDay)
        case "edit-copy-meeting-link":
            copyMeetingLinkFromForm()
        case "edit-duplicate":
            Task { await duplicateFocusedOrFormEvent() }
        case "edit-delete":
            Task { await deleteFormEvent() }
        case "edit-cancel-meeting":
            Task { await triggerBookedMeetingCancellation() }
        case "edit-reschedule-meeting":
            rescheduleBookedMeeting()
        case "edit-close-form":
            requestCloseEventForm()
        default:
            break
        }
    }

    public func filteredPaletteSections() -> [CommandPaletteSection] {
        CommandPaletteSearch.filter(sections: paletteSections(), query: commandPaletteStore.query)
    }

    /// Disabled rows are skipped like web `useListNavigation({ disabledIndices })`.
    private var selectablePaletteItems: [CommandPaletteItem] {
        filteredPaletteSections().flatMap(\.items).filter { !$0.isDisabled }
    }

    public var selectedPaletteItemId: String? {
        let items = selectablePaletteItems
        return items.first { $0.id == commandPaletteStore.selectedCommandId }?.id ?? items.first?.id
    }

    public func movePaletteSelection(by delta: Int) {
        let items = selectablePaletteItems
        guard !items.isEmpty else { return }
        let index = items.firstIndex { $0.id == commandPaletteStore.selectedCommandId } ?? 0
        let count = items.count
        let next = ((index + delta) % count + count) % count
        commandPaletteStore.select(commandId: items[next].id)
    }

    public func activatePaletteSelection() {
        guard let id = selectedPaletteItemId else { return }
        runPaletteCommand(id: id)
    }

    func legendSections() -> [ShortcutLegendSection] {
        ShortcutLegendSections.menuSections(
            registry: shortcutRegistry,
            options: ShortcutMenuFilter.Options(
                view: shortcutMenuView,
                isViewingCurrentPeriod: isViewingCurrentPeriod,
                isFormOpen: draftStore.status.isFormOpen,
                isTrialing: billingStore.status?.subscriptionStatus == .trialing))
    }

    public func filteredLegendSections() -> [ShortcutLegendSection] {
        let query = shortcutsLegendStore.searchQuery
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return legendSections()
        }
        let needle = query.lowercased()
        return legendSections().compactMap { section in
            let rows = section.rows.filter { row in
                row.label.lowercased().contains(needle)
                    || row.keycaps.joined(separator: " ").lowercased().contains(needle)
            }
            guard !rows.isEmpty else { return nil }
            return ShortcutLegendSection(id: section.id, title: section.title, rows: rows)
        }
    }

    public func runPaletteCommand(id selectionId: String) {
        let id = selectionId.hasPrefix("recent-") ? String(selectionId.dropFirst(7)) : selectionId
        let sections = filteredPaletteSections()
        if sections.flatMap(\.items).contains(where: { $0.id == selectionId && $0.isDisabled }) { return }
        let savedQuery = commandPaletteStore.query
        commandPaletteStore.recordSelection(commandId: id)

        switch id {
        case "go-to-date":
            if let date = UserDateParsing.parseUserDate(savedQuery, now: referenceNow) {
                commandPaletteStore.close()
                selectGoToDateFromPalette(date)
            }
            return
        default:
            commandPaletteStore.close()
        }

        switch id {
        case "create-event":
            handleShortcut(.createTimed)
        case "create-allday-event":
            handleShortcut(.createAllday)
        case "about":
            onShowAbout?()
        case "today":
            handleShortcut(.navToday)
        case "go-to-day":
            handleShortcut(.navDayView)
        case "go-to-week":
            handleShortcut(.navWeekView)
        case "go-to-life":
            handleShortcut(.navLifeView)
        case "show-shortcuts":
            shortcutsLegendStore.open()
        case "toggle-theme":
            let next: CompassThemeName =
                settingsStore.theme == .darkAbyss ? .lightBeach : .darkAbyss
            settingsStore.setTheme(next)
        case "open-settings":
            handleShortcut(.otherSettings)
        case "practice-shortcuts":
            blockPartyStore.replayFromPalette()
        case "show-welcome-guide":
            onboardingStore.openWelcomeGuide()
        case "toggle-shortcut-tips":
            levelsStore.setTipsMuted(!levelsStore.tipsMuted)
        case "toggle-shortcut-level":
            levelsStore.setBadgeHidden(!levelsStore.badgeHidden)
        case "toggle-sidebar":
            handleShortcut(.otherSidebar)
        case "sign-up":
            authStore.openModal(.signUp)
        case "log-in":
            authStore.openModal(.login)
        case "log-out":
            requestLogout()
        case "subscribe-now":
            handleShortcut(.otherSubscribe)
        case "undo-last-change":
            undoLastChange()
        case "redo-last-change":
            redoLastChange()
        case "focus-month-picker":
            handleShortcut(.focusSidebar)
        case "open-up-next":
            openUpNextEvent()
            recordShortcut(.navUpNext)
        case "join-up-next-meeting":
            joinUpNextMeeting()
            recordShortcut(.navJoinMeeting)
        case "clear-sample-events":
            Task { await clearSampleEvents() }
        case "change-default-timezone":
            settingsStore.openTimezoneDialog(.pin)
        case "time-travel":
            handleShortcut(.otherTimeTravel)
        case "show-accounts":
            settingsStore.open(page: .accounts)
        case "show-billing":
            settingsStore.open(page: .billing)
        case "update-card":
            settingsStore.open(page: .billing)
            Task { await billingStore.openHostedPaymentMethodUpdate() }
        case "show-booking", "setup-meeting-page":
            openBookingSettings()
        case "open-meeting-page":
            if let url = bookingStore.meetingLinkURL(calendars: calendars) {
                openExternalURLHandler?(url)
            }
        case "share-feedback":
            openFeedbackDialog()
        case "book-personal-onboarding":
            openExternalURLHandler?(CommandPaletteCatalog.personalOnboardingURL)
        default:
            if id.hasPrefix("event-form-") {
                let actionId = String(id.dropFirst("event-form-".count))
                runEventFormPaletteCommand(actionId)
            } else if id.hasPrefix("event-") {
                let eventId = String(id.dropFirst("event-".count))
                focusPaletteEvent(eventId: eventId)
            }
            break
        }
    }

    func selectGoToDateFromPalette(_ date: Date) {
        goToDate(date)
        let viewKind: UserDateParsing.GoToDateViewKind = switch viewStore.view {
        case .day: .day
        case .week: .week
        case .life: .life
        }
        commandPaletteStore.announce(UserDateParsing.goToDateAnnouncement(date, view: viewKind))
        recordShortcut(.navGoToDate)
    }

    func focusPaletteEvent(eventId: String) {
        guard let event = paletteEventSearchEvents[eventId]
            ?? loadedEvents.first(where: { $0.id.rawValue == eventId }) else { return }
        if paletteEventSearchEvents[eventId] != nil {
            loadedEvents.removeAll { $0.id == event.id }
            loadedEvents.append(event)
        }
        if viewStore.view == .life { viewStore.view = .week }
        if case .timed(let timed) = event.schedule,
           let start = CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue)
        {
            goToDate(start)
        } else if case .allDay(let allDay) = event.schedule,
                  let start = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.start)
        {
            goToDate(start)
        }
        focusGridEvent(eventId: eventId)
        publishGridFocusAccessibilityProbe(eventId: eventId)
    }

    public func toggleCommandPalette(fromGoToDate: Bool = false) {
        if commandPaletteStore.isOpen {
            commandPaletteStore.close()
            resetPaletteEventSearch()
            return
        }
        shortcutsLegendStore.close()
        pointerHintStore.hide()
        resetPaletteEventSearch()
        commandPaletteStore.open()
        if fromGoToDate {
            recordShortcut(.navGoToDate)
        }
    }

    public func toggleShortcutsLegend() {
        if shortcutsLegendStore.isOpen {
            shortcutsLegendStore.close()
        } else {
            commandPaletteStore.close()
            pointerHintStore.hide()
            shortcutsLegendStore.open()
            recordShortcut(.otherShortcuts)
        }
    }

    public func openShortcutsCatalogWindow() {
        overlayStores.catalog.presentPublicCatalog(
            sections: ShortcutLegendSections.publicCatalogSections(registry: shortcutRegistry))
    }

    public func schedulePaletteEventSearch() {
        let query = trimmedPaletteQuery
        resetPaletteEventSearch()
        guard query.count >= EventTitleSearch.minQueryLength else { return }
        let revision = sessionRevision
        paletteSearchTask = Task { [weak self] in
            guard let self else { return }
            let local = paletteEventHits(query: query)
            self.setPaletteEventSearchHits(local)
            guard isSignedIn, !Task.isCancelled else { return }
            let window = EventTitleSearch.searchWindow(now: referenceNow)
            let range = DateRange(start: window.start, end: window.end)
            let listQuery = EventListQuery(
                kind: "range",
                start: range.startISO,
                end: range.endISO,
                q: query)
            do {
                let remoteEvents = try await environment.apiClient.events.list(listQuery)
                guard revision == sessionRevision, isSignedIn, !Task.isCancelled else { return }
                self.acceptPaletteSearchResults(remoteEvents, query: query)
            } catch {}
        }
    }

    func resetPaletteEventSearch() {
        paletteSearchTask?.cancel()
        paletteSearchTask = nil
        paletteEventSearchEvents = [:]
        setPaletteEventSearchHits([])
    }

    func acceptPaletteSearchResults(_ events: [Event], query: String) {
        guard commandPaletteStore.isOpen, query == trimmedPaletteQuery else { return }
        let matches = EventTitleSearch.search(events: events, query: query,
            now: referenceNow, limit: EventTitleSearch.paletteLimit)
        paletteEventSearchEvents = Dictionary(matches.map { ($0.id.rawValue, $0) },
            uniquingKeysWith: { _, latest in latest })
        let hits = matches.compactMap(paletteHit(from:))
        setPaletteEventSearchHits(mergePaletteHits(local: paletteEventHits(query: query), remote: hits))
    }

    private func mergePaletteHits(
        local: [CommandPaletteEventHit],
        remote: [CommandPaletteEventHit]
    ) -> [CommandPaletteEventHit] {
        var seen = Set<String>()
        var merged: [CommandPaletteEventHit] = []
        for hit in remote + local {
            if seen.insert(hit.eventId).inserted {
                merged.append(hit)
            }
        }
        return Array(merged.prefix(EventTitleSearch.paletteLimit))
    }

    private func paletteEventHits(query: String) -> [CommandPaletteEventHit] {
        guard query.trimmingCharacters(in: .whitespacesAndNewlines).count >= EventTitleSearch.minQueryLength else {
            return []
        }
        let local = EventTitleSearch.search(
            events: loadedEvents,
            query: query,
            now: referenceNow,
            limit: EventTitleSearch.paletteLimit)
        return local.compactMap(paletteHit(from:))
    }

    private func paletteHit(from event: Event) -> CommandPaletteEventHit? {
        let title = EventTitleSearch.eventTitle(event)
        guard !title.isEmpty else { return nil }
        return CommandPaletteEventHit(
            eventId: event.id.rawValue,
            label: title,
            subtitle: paletteEventSubtitle(for: event))
    }

    private func paletteEventSubtitle(for event: Event) -> String {
        switch event.schedule {
        case .allDay(let allDay):
            return "All day, \(allDay.start)"
        case .timed(let timed):
            if let date = CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue) {
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.calendar = EffectiveTimeZone.calendar
                formatter.timeZone = EffectiveTimeZone.timeZone
                formatter.dateFormat = "EEE, MMM d, h:mm a"
                return formatter.string(from: date)
            }
            return timed.start.rawValue
        }
    }

    private var shortcutMenuView: ShortcutMenuFilter.AppView {
        switch viewStore.view {
        case .day: .day
        case .week: .week
        case .life: .life
        }
    }

    private var isViewingCurrentPeriod: Bool {
        let calendar = EffectiveTimeZone.calendar
        let today = calendar.startOfDay(for: referenceNow)
        let start = calendar.startOfDay(for: startOfView)
        let end = calendar.startOfDay(for: endOfView)
        return today >= start && today <= end
    }
}

@MainActor
public protocol ShortcutsCatalogPresenting: AnyObject {
    func presentPublicCatalog(sections: [ShortcutLegendSection])
}

@MainActor
public final class OverlayStores {
    public let palette: CommandPaletteStore
    public let legend: ShortcutsLegendStore
    public let catalog: ShortcutsCatalogPresenting
    public let eventMenu: EventMenuStore
    public let statusToast: StatusToastStore
    public let recurrenceScope: RecurrenceScopeStore
    public let eventJumpSelection: EventJumpSelectionStore
    public var editSequenceMenuVisible = false

    public init(catalog: ShortcutsCatalogPresenting = NoOpShortcutsCatalogPresenter()) {
        palette = CommandPaletteStore()
        legend = ShortcutsLegendStore()
        self.catalog = catalog
        eventMenu = EventMenuStore()
        statusToast = StatusToastStore()
        recurrenceScope = RecurrenceScopeStore()
        eventJumpSelection = EventJumpSelectionStore()
    }
}

@MainActor
public final class NoOpShortcutsCatalogPresenter: ShortcutsCatalogPresenting {
    public init() {}
    public func presentPublicCatalog(sections: [ShortcutLegendSection]) {}
}

enum CommandPaletteSearch {
    static func filter(sections: [CommandPaletteSection], query: String) -> [CommandPaletteSection] {
        let mapped = sections.map { section in
            CommandPaletteSearchLogic.Section(
                id: section.id,
                heading: section.heading,
                items: section.items.map {
                    CommandPaletteSearchLogic.CommandPaletteSearchItem(
                        id: $0.id,
                        label: $0.label,
                        keywords: $0.keywords + ($0.shortcut.map { [$0] } ?? []))
                })
        }
        let filtered = CommandPaletteSearchLogic.filter(sections: mapped, query: query)
        let byId = Dictionary(uniqueKeysWithValues: sections.flatMap { section in
            section.items.map { ($0.id, $0) }
        })
        return filtered.map { section in
            CommandPaletteSection(
                id: section.id,
                heading: section.heading,
                items: section.items.compactMap { byId[$0.id] })
        }
    }
}
