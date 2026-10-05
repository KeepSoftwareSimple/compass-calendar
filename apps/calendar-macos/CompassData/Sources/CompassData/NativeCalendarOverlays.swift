import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var commandPaletteStore: CommandPaletteStore { overlayStores.palette }
    public var shortcutsLegendStore: ShortcutsLegendStore { overlayStores.legend }
    public var shortcutsCatalogPresenter: ShortcutsCatalogPresenting { overlayStores.catalog }

    var overlayKeyboardCaptureActive: Bool {
        commandPaletteStore.isOpen || shortcutsLegendStore.isOpen
    }

    func paletteSections() -> [CommandPaletteSection] {
        let trimmed = commandPaletteStore.query
        let handlers = CommandPaletteHandlers { [weak self] date in
            Task { @MainActor in
                self?.selectGoToDateFromPalette(date)
            }
        }
        let localHits = paletteEventHits(query: trimmed)
        let mergedHits = mergePaletteHits(local: localHits, remote: paletteEventSearchHits)
        return CommandPaletteCatalog.sections(
            view: viewStore.view,
            query: trimmed,
            now: referenceNow,
            isSignedIn: isSignedIn,
            isTrialing: billingStore.status?.subscriptionStatus == .trialing,
            eventHits: mergedHits,
            recentIds: commandPaletteStore.recentCommandIds,
            handlers: handlers)
    }

    public func filteredPaletteSections() -> [CommandPaletteSection] {
        CommandPaletteSearch.filter(sections: paletteSections(), query: commandPaletteStore.query)
    }

    func legendSections() -> [ShortcutLegendSection] {
        ShortcutLegendSections.menuSections(
            registry: shortcutRegistry,
            options: ShortcutMenuFilter.Options(
                view: shortcutMenuView,
                isViewingCurrentPeriod: isViewingCurrentPeriod,
                isFormOpen: false,
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

    public func runPaletteCommand(id: String) {
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
        case "open-settings":
            handleShortcut(.otherSettings)
        case "sign-up":
            authStore.openModal(.signUp)
        case "log-in":
            authStore.openModal(.login)
        default:
            if id.hasPrefix("event-") {
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
        if let section = ShortcutTelemetrySection.section(for: .navGoToDate) {
            levelsStore.recordShortcutInvocation(.navGoToDate, section: section)
        }
    }

    func focusPaletteEvent(eventId: String) {
        guard let event = loadedEvents.first(where: { $0.id.rawValue == eventId }) else { return }
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
            return
        }
        shortcutsLegendStore.close()
        commandPaletteStore.open()
        if fromGoToDate, let section = ShortcutTelemetrySection.section(for: .navGoToDate) {
            levelsStore.recordShortcutInvocation(.navGoToDate, section: section)
        }
    }

    public func toggleShortcutsLegend() {
        if shortcutsLegendStore.isOpen {
            shortcutsLegendStore.close()
        } else {
            commandPaletteStore.close()
            shortcutsLegendStore.open()
            if let section = ShortcutTelemetrySection.section(for: .otherShortcuts) {
                levelsStore.recordShortcutInvocation(.otherShortcuts, section: section)
            }
        }
    }

    func openShortcutsCatalogWindow() {
        overlayStores.catalog.presentPublicCatalog(
            sections: ShortcutLegendSections.publicCatalogSections(registry: shortcutRegistry))
    }

    public func schedulePaletteEventSearch() {
        let query = commandPaletteStore.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= EventTitleSearch.minQueryLength else {
            setPaletteEventSearchHits([])
            return
        }
        paletteSearchTask?.cancel()
        paletteSearchTask = Task { [weak self] in
            guard let self else { return }
            let local = paletteEventHits(query: query)
            await MainActor.run {
                self.setPaletteEventSearchHits(local)
            }
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
                let mapped = try remoteEvents.map { try EventMapping.event(from: $0) }
                let remoteHits = EventTitleSearch.search(
                    events: mapped,
                    query: query,
                    now: referenceNow,
                    limit: EventTitleSearch.paletteLimit)
                    .compactMap { event -> CommandPaletteEventHit? in
                        let title = EventTitleSearch.eventTitle(event)
                        guard !title.isEmpty else { return nil }
                        return CommandPaletteEventHit(
                            eventId: event.id.rawValue,
                            label: title,
                            subtitle: paletteEventSubtitle(for: event))
                    }
                await MainActor.run {
                    self.setPaletteEventSearchHits(mergePaletteHits(local: local, remote: remoteHits))
                }
            } catch {}
        }
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
        return local.compactMap { event in
            let title = EventTitleSearch.eventTitle(event)
            guard !title.isEmpty else { return nil }
            return CommandPaletteEventHit(
                eventId: event.id.rawValue,
                label: title,
                subtitle: paletteEventSubtitle(for: event))
        }
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

    public init(catalog: ShortcutsCatalogPresenting = NoOpShortcutsCatalogPresenter()) {
        palette = CommandPaletteStore()
        legend = ShortcutsLegendStore()
        self.catalog = catalog
    }
}

@MainActor
public final class NoOpShortcutsCatalogPresenter: ShortcutsCatalogPresenting {
    public init() {}
    public func presentPublicCatalog(sections: [ShortcutLegendSection]) {}
}

enum CommandPaletteSearch {
    static func filter(sections: [CommandPaletteSection], query: String) -> [CommandPaletteSection] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return sections }
        return sections.compactMap { section in
            if section.id == "go-to-date" { return section }
            let items = section.items.filter { item in
                item.label.lowercased().contains(needle)
                    || item.keywords.contains { $0.lowercased().contains(needle) }
                    || (item.shortcut?.lowercased().contains(needle) ?? false)
            }
            guard !items.isEmpty else { return nil }
            return CommandPaletteSection(id: section.id, heading: section.heading, items: items)
        }
    }
}
