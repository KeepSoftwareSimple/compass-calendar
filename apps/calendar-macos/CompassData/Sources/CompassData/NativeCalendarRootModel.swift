import CompassKit
import Foundation
import Observation

@MainActor
@Observable
public final class NativeCalendarRootModel {
    public let viewStore: ViewStore
    public let configStore: ConfigStore
    public let authStore: AuthStore
    public let billingStore: BillingStore
    public let settingsStore: SettingsStore
    public var syncConnectionsStore: SyncConnectionsStore { environment.syncConnectionsStore }
    public let levelsStore: LevelsStore
    public let focusStore: FocusStore
    public let pointerHintStore: PointerHintStore
    public let lifeStore: LifeStore
    public private(set) var headerTitle = ""
    public private(set) var timeGridState: TimeGridState
    /// Title of the focused grid event for native UI tests and accessibility probes.
    public private(set) var gridFocusAccessibilityLabel: String?
    public private(set) var calendars: [CompassCalendar] = []
    public var isSignedIn: Bool { authStore.authenticated }
    public var shortcutRegistry: ShortcutRegistry { environment.shortcutRegistry }
    public private(set) var contentTrackWidth: CGFloat = 1010
    public internal(set) var sidebandEvents: [Event] = []
    public var onSidebandDidChange: (() -> Void)?
    public var openConferenceURLHandler: ((URL) -> Void)?
    public var onUpNextBannerShown: ((NotifiableEvent) -> Void)?
    /// Window-level accessibility probe for native UI tests (see Compass app).
    public var onGridFocusAccessibilityLabelChanged: ((String?) -> Void)?
    public var monthPickerMonth: Date
    public var pendingScroll: TimeGridScrollRequest?

    private let environment: NativeCalendarEnvironment
    let eventsStore: EventsStore
    private let hiddenEventsStore: HiddenEventsStore
    private let calendarRepository: CalendarRepository
    private let demoSeed: DemoSeedFixture?
    private let analyticsIdentity: AnalyticsIdentityCoordinator
    private var eventStream: ServerEventStream?
    var loadedEvents: [Event] = []
    private var refreshTask: Task<Void, Never>?
    private var focusLayoutCards: [FocusLayoutCard] = []
    private var eventJumpHintLabels: [EventJumpChipHint] = []
    private var didApplyDemoFixtureScroll = false
    private var didApplyInitialUIFocus = false

    public var referenceNow: Date {
        demoSeed?.referenceNow ?? Date()
    }

    var demoEventIds: Set<String> {
        demoSeed?.demoEventIds ?? []
    }

    public init(environment: NativeCalendarEnvironment, demoSeed: DemoSeedFixture? = nil) {
        self.environment = environment
        self.demoSeed = demoSeed
        if let demoSeed {
            EffectiveTimeZone.identifier = demoSeed.timeZone
        }
        eventsStore = environment.eventsStore
        hiddenEventsStore = environment.hiddenEventsStore
        calendarRepository = environment.calendarRepository
        configStore = environment.configStore
        authStore = environment.authStore
        billingStore = environment.billingStore
        levelsStore = environment.levelsStore
        lifeStore = LifeStore(today: { demoSeed?.referenceNow ?? Date() })
        analyticsIdentity = environment.analyticsIdentity

        let anchor: Date = {
            guard let demoSeed else { return Date() }
            let calendar = EffectiveTimeZone.calendar
            return calendar.dateInterval(of: .weekOfYear, for: demoSeed.referenceNow)?.start
                ?? demoSeed.referenceNow
        }()
        viewStore = ViewStore(
            view: .week,
            anchorDate: anchor,
            visibleDayCount: CalendarWindowMath.weekDayCount,
            pinnedTimeZone: demoSeed?.timeZone ?? CompassDevicePreferences.readPinnedTimeZone()
        )
        if demoSeed == nil {
            viewStore.setTimeTravelTimeZone(CompassDevicePreferences.readTimeTravelTimeZone())
        }
        settingsStore = SettingsStore(viewStore: viewStore)
        settingsStore.onDevicePreferencesChanged = { [weak self] in
            self?.rebuildPresentation()
        }
        monthPickerMonth = anchor
        focusStore = FocusStore(view: .week)
        pointerHintStore = PointerHintStore()
        timeGridState = TimeGridState(
            layoutMode: .week,
            referenceNow: anchor,
            scenario: GridLayoutSnapshotFixtures.parityScenario(
                layoutMode: .week,
                visibleDateKeys: []
            ),
            trackWidth: 1010
        )
        authStore.onAuthenticated = { [weak self] in
            await self?.handleAuthenticated()
        }
        authStore.onSignedOut = { [weak self] in
            await self?.handleSignedOut()
        }
        billingStore.setAuthenticated(authStore.authenticated)
        billingStore.attach(settingsStore: settingsStore)
        rebuildPresentation()
    }

    public func start() async {
        await configStore.load()
        await configureAnalyticsFromConfig()
        await authStore.bootstrap(forceDemoSignedIn: demoSeed != nil)
        if demoSeed != nil {
            await bootstrapFixtureSession()
        }
        try? await hiddenEventsStore.load()
        await reloadCalendars()
        await refreshVisibleRange()
        await refreshSideband()
        if isSignedIn {
            startEventStream()
        }
    }

    public func handleResume() async {
        if let eventStream {
            await eventStream.stop()
        }
        if isSignedIn {
            startEventStream()
        }
        try? eventsStore.handleStreamReopen()
        await refreshVisibleRange()
        await refreshSideband()
        await reloadCalendars()
    }

    public func signOut() async throws {
        try await authStore.signOut()
    }

    private func handleAuthenticated() async {
        billingStore.setAuthenticated(true)
        await billingStore.refreshAfterSignIn()
        startEventStream()
        await syncConnectionsStore.reloadFromMetadata()
        await reloadCalendars()
        try? await hiddenEventsStore.load()
        await refreshVisibleRange()
        await refreshSideband()
    }

    func refreshCalendarsAndVisibleRange() async {
        await reloadCalendars()
        await refreshVisibleRange()
    }

    private func handleSignedOut() async {
        billingStore.setAuthenticated(false)
        settingsStore.close()
        if let eventStream {
            await eventStream.stop()
        }
        loadedEvents = []
        sidebandEvents = []
        calendars = []
        rebuildPresentation()
    }

    public func updateContentTrackWidth(_ width: CGFloat) {
        let resolved = max(UITestLaunchPolicy.pinnedWeekGridTrackWidth ?? width, 320)
        if abs(resolved - contentTrackWidth) > 0.5 {
            contentTrackWidth = resolved
            let count = CalendarWindowMath.computeVisibleDayCount(trackWidth: Double(resolved))
            viewStore.setVisibleDayCount(count)
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        }
    }

    public func handleShortcut(_ id: ShortcutId) {
        if let section = ShortcutTelemetrySection.section(for: id) {
            levelsStore.recordShortcutInvocation(id, section: section)
        }
        switch id {
        case .navNext:
            if viewStore.view == .life {
                lifeStore.cycleVariation(direction: 1)
            } else {
                pageWindow(direction: 1)
            }
        case .navPrevious:
            if viewStore.view == .life {
                lifeStore.cycleVariation(direction: -1)
            } else {
                pageWindow(direction: -1)
            }
        case .navToday:
            if viewStore.view == .life {
                lifeStore.focusCurrentWeek()
            } else {
                goToToday()
            }
        case .navLifePrev:
            lifeStore.cycleVariation(direction: -1)
        case .navLifeNext:
            lifeStore.cycleVariation(direction: 1)
        case .navLifeCurrent:
            lifeStore.focusCurrentWeek()
        case .navLifeView:
            viewStore.view = .life
            rebuildPresentation()
        case .navDayView:
            viewStore.view = .day
            viewStore.setVisibleDayCount(1)
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        case .navWeekView:
            viewStore.view = .week
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        case .navShiftLeft:
            shiftViewByDay(-1)
        case .navShiftRight:
            shiftViewByDay(1)
        case .navMonthPrev:
            shiftMonth(by: -1)
        case .navMonthNext:
            shiftMonth(by: 1)
        case .navScrollUp:
            pendingScroll = .pageUp
        case .navScrollDown:
            pendingScroll = .pageDown
        case .navScrollHourUp:
            pendingScroll = .hourUp
        case .navScrollHourDown:
            pendingScroll = .hourDown
        case .editFocusPrev:
            moveFocus(.up)
        case .editFocusNext:
            moveFocus(.down)
        case .editFocusLeft:
            moveFocus(.left)
        case .editFocusRight:
            moveFocus(.right)
        case .editCycleEdge:
            cycleFocusedEdge(forward: true)
        case .otherSettings:
            settingsStore.open(page: .accounts)
        case .otherTimeTravel:
            settingsStore.openTimezoneDialog(.timeTravel)
        default:
            break
        }
    }

    public func handleShiftTabCycleEdge() {
        cycleFocusedEdge(forward: false)
    }

    public func setPageJumpHintsVisible(_ visible: Bool) {
        focusStore.setPageJumpHintsVisible(visible)
    }

    public func setEventJumpHintsVisible(_ visible: Bool) {
        if visible {
            eventJumpHintLabels = buildEventJumpHints()
        } else {
            eventJumpHintLabels = []
        }
        applyFocusPresentation()
    }

    public func showPointerHint(
        for target: PointerClickTarget,
        registry: ShortcutRegistry,
        focusedGridEventLabel: String? = nil
    ) {
        var resolvedFocusLabel = focusedGridEventLabel
        if target == .eventCard, resolvedFocusLabel == nil {
            resolvedFocusLabel = gridFocusAccessibilityLabel ?? focusedGridEventAccessibilityLabel()
        }
        pointerHintStore.pulse(
            target: target,
            registry: registry,
            focusedGridEventLabel: resolvedFocusLabel
        )
    }

    public func handleEventCardPointerDown(eventId: String, registry: ShortcutRegistry) {
        focusEvent(eventId: eventId)
        showPointerHint(for: .eventCard, registry: registry)
    }

    public func focusGridEvent(eventId: String) {
        focusEvent(eventId: eventId)
    }

    public func publishGridFocusAccessibilityProbe(eventId: String? = nil) {
        let colWidths = timeGridState.resolvedColumnWidths()
        let cards = timeGridState.snapshot(colWidths: colWidths).cards
        let resolved =
            gridFocusAccessibilityLabel
            ?? eventId.flatMap { resolveGridFocusLabel(eventId: $0, cards: cards) }
            ?? focusedGridEventAccessibilityLabel()
        if let resolved {
            gridFocusAccessibilityLabel = resolved
        }
        onGridFocusAccessibilityLabelChanged?(resolved)
    }

    public func handleGridPointerDown(registry: ShortcutRegistry) {
        showPointerHint(for: .gridScroll, registry: registry)
    }

    public func focusPageJump(digit: Character) {
        guard let target = focusStore.pageJumpTargets.first(where: { $0.digit == String(digit) }) else {
            return
        }
        switch target.id {
        case "month-picker":
            monthPickerMonth = viewStore.anchorDate
        default:
            break
        }
    }

    public func focusEventJump(digit: Character) {
        guard let hint = eventJumpHintLabels.first(where: { $0.label == String(digit) }) else { return }
        focusEvent(eventId: hint.eventId)
    }

    public func consumePendingScroll() -> TimeGridScrollRequest? {
        defer { pendingScroll = nil }
        return pendingScroll
    }

    private func moveFocus(_ direction: FocusMoveDirection) {
        guard !focusLayoutCards.isEmpty else { return }

        if let focusedId = focusStore.focusedEventId?.rawValue,
            let focused = focusLayoutCard(for: focusedId),
            let next = GridFocusNavigator.adjacent(
                focused: focused,
                direction: direction,
                candidates: focusLayoutCards,
                layoutMode: layoutMode()
            )
        {
            focusEvent(eventId: next.eventId)
            return
        }

        // Match web `moveDraftOrFocusAdjacent`: seed nearest-to-now only when nothing is focused.
        guard focusStore.focusedEventId == nil else { return }

        if let seeded = seedFocusEventId() {
            focusEvent(eventId: seeded)
        }
    }

    private func focusLayoutCard(for eventId: String) -> FocusLayoutCard? {
        if let card = focusLayoutCards.first(where: { $0.eventId == eventId }) {
            return card
        }
        let colWidths = timeGridState.resolvedColumnWidths()
        guard
            let card = timeGridState.snapshot(colWidths: colWidths).cards
                .first(where: { $0.eventId == eventId })
        else { return nil }
        return FocusLayoutCard(
            eventId: card.eventId,
            frame: card.frame,
            isAllDay: card.kind == .allDay
        )
    }

    private func cycleFocusedEdge(forward: Bool) {
        guard let eventId = focusStore.focusedEventId else { return }
        focusStore.cycleEdge(
            for: eventId,
            direction: forward ? .forward : .backward
        )
        applyFocusPresentation()
    }

    private func focusEvent(eventId: String) {
        let type: ViewInteractionEventType =
            focusLayoutCards.first(where: { $0.eventId == eventId })?.isAllDay == true
                ? .allDay
                : .timed
        focusStore.setFocused(
            eventId: EventId(rawValue: eventId),
            eventType: type
        )
        applyFocusPresentation()
    }

    private func seedFocusEventId() -> String? {
        let reference = demoSeed?.referenceNow ?? Date()
        if !loadedEvents.isEmpty {
            if let nearest = loadedEvents.min(by: { lhs, rhs in
                abs(eventStart(lhs).timeIntervalSince(reference))
                    < abs(eventStart(rhs).timeIntervalSince(reference))
            }) {
                return nearest.id.rawValue
            }
        }
        return focusLayoutCards.sorted { $0.frame.top < $1.frame.top }.first?.eventId
    }

    private func eventStart(_ event: Event) -> Date {
        switch event.schedule {
        case .timed(let timed):
            CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue) ?? .distantPast
        case .allDay(let allDay):
            CompassDateParsing.parseInEffectiveTimeZone(allDay.start) ?? .distantPast
        }
    }

    private func applyFocusPresentation() {
        timeGridState = TimeGridState(
            layoutMode: timeGridState.layoutMode,
            referenceNow: timeGridState.referenceNow,
            scenario: timeGridState.scenario,
            trackWidth: timeGridState.trackWidth,
            focusedEventId: focusStore.focusedEventId?.rawValue,
            eventJumpHints: eventJumpHintLabels,
            hasSecondaryTimeZone: timeGridState.hasSecondaryTimeZone,
            effectiveTimeZone: timeGridState.effectiveTimeZone,
            timeTravelTimeZone: timeGridState.timeTravelTimeZone
        )
        let colWidths = timeGridState.resolvedColumnWidths()
        let cards = timeGridState.snapshot(colWidths: colWidths).cards
        gridFocusAccessibilityLabel = focusStore.focusedEventId.flatMap { focusedId in
            resolveGridFocusLabel(eventId: focusedId.rawValue, cards: cards)
        }
        if pointerHintStore.isVisible {
            pointerHintStore.updateFocusedGridEventLabel(gridFocusAccessibilityLabel)
        }
        onGridFocusAccessibilityLabelChanged?(gridFocusAccessibilityLabel)
    }

    private func focusedGridEventAccessibilityLabel() -> String? {
        guard let focusedId = focusStore.focusedEventId?.rawValue else { return nil }
        let colWidths = timeGridState.resolvedColumnWidths()
        let cards = timeGridState.snapshot(colWidths: colWidths).cards
        return resolveGridFocusLabel(eventId: focusedId, cards: cards)
    }

    private func resolveGridFocusLabel(eventId: String, cards: [GridLayoutCardSnapshot]) -> String? {
        if let label = cards.first(where: { $0.eventId == eventId })?.label {
            return label
        }
        guard let event = loadedEvents.first(where: { $0.id.rawValue == eventId }) else { return nil }
        switch event.content {
        case .busy:
            return CalendarEventViewModel.busyEventTitle
        case .details(let details):
            return details.title
        }
    }

    public func goToDate(_ date: Date) {
        viewStore.setAnchorDate(date)
        monthPickerMonth = date
        rebuildPresentation()
        scheduleRefreshVisibleRange()
    }

    private func pageWindow(direction: Int) {
        let calendar = EffectiveTimeZone.calendar
        let delta = direction * viewStore.visibleDayCount
        if let next = calendar.date(byAdding: .day, value: delta, to: startOfView) {
            viewStore.setAnchorDate(next)
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        }
    }

    private func shiftViewByDay(_ days: Int) {
        let calendar = EffectiveTimeZone.calendar
        if let next = calendar.date(byAdding: .day, value: days, to: startOfView) {
            viewStore.setAnchorDate(next)
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        }
    }

    private func goToToday() {
        let today = Date()
        let calendar = EffectiveTimeZone.calendar
        if viewStore.visibleDayCount == 1 {
            viewStore.setAnchorDate(today)
        } else {
            let weekStart = calendar.dateInterval(of: .weekOfYear, for: today)?.start ?? today
            viewStore.setAnchorDate(weekStart)
        }
        monthPickerMonth = today
        rebuildPresentation()
        scheduleRefreshVisibleRange()
    }

    private func shiftMonth(by months: Int) {
        let calendar = EffectiveTimeZone.calendar
        if let next = calendar.date(byAdding: .month, value: months, to: monthPickerMonth) {
            monthPickerMonth = next
        }
    }

    private var startOfView: Date {
        EffectiveTimeZone.calendar.startOfDay(for: viewStore.anchorDate)
    }

    private var endOfView: Date {
        let calendar = EffectiveTimeZone.calendar
        return calendar.date(
            byAdding: .day,
            value: max(viewStore.visibleDayCount, 1) - 1,
            to: startOfView
        ) ?? startOfView
    }

    private func visibleDateKeys() -> [String] {
        let calendar = EffectiveTimeZone.calendar
        return (0 ..< viewStore.visibleDayCount).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset, to: startOfView) else {
                return nil
            }
            return CompassDateParsing.formatCalendarDay(day)
        }
    }

    public var shortcutContext: ShortcutContext {
        ShortcutContext(
            lifeView: viewStore.view == .life,
            weekView: viewStore.view == .week,
            isFormOpen: false,
            isTrialing: billingStore.status?.subscriptionStatus == .trialing)
    }

    private func layoutMode() -> GridLayoutMode {
        viewStore.view == .day ? .day : .week
    }

    private func rebuildPresentation() {
        if viewStore.view == .life {
            headerTitle = "Life"
            return
        }
        headerTitle = CalendarHeadingLabel.format(start: startOfView, end: endOfView, now: Date())
        let hiddenIds = Set(hiddenEventsStore.hiddenEventIds.map(\.rawValue))
        let demoIds = demoSeed?.demoEventIds ?? []
        let scenario = GridLayoutScenarioBuilder.build(
            layoutMode: layoutMode(),
            visibleDateKeys: visibleDateKeys(),
            referenceNow: demoSeed?.referenceNow ?? Date(),
            calendars: visibleCalendars(),
            events: loadedEvents,
            hiddenEventIds: hiddenIds,
            demoEventIds: demoIds
        )
        syncFocusRegistry(from: scenario)
        let hasSecondaryTimeZone = viewStore.timeTravelTimeZone != nil
        let colWidths = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: demoSeed?.referenceNow ?? Date(),
            scenario: scenario,
            trackWidth: contentTrackWidth,
            hasSecondaryTimeZone: hasSecondaryTimeZone,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        ).resolvedColumnWidths()
        let snapshot = GridLayoutSnapshotBuilder.build(
            scenario: scenario,
            colWidths: colWidths,
            hasSecondaryTimeZone: hasSecondaryTimeZone)
        focusLayoutCards = snapshot.cards.map { card in
            FocusLayoutCard(
                eventId: card.eventId,
                frame: card.frame,
                isAllDay: card.kind == .allDay
            )
        }
        focusStore.setPageJumpTargets(nativePageJumpTargets())
        timeGridState = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: demoSeed?.referenceNow ?? Date(),
            scenario: scenario,
            trackWidth: contentTrackWidth,
            focusedEventId: focusStore.focusedEventId?.rawValue,
            eventJumpHints: eventJumpHintLabels,
            hasSecondaryTimeZone: hasSecondaryTimeZone,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        )
        if demoSeed != nil, !loadedEvents.isEmpty, !didApplyDemoFixtureScroll {
            let allDayOffset = 28 + snapshot.metrics.allDayRowHeight
            if let standup = snapshot.cards.first(where: {
                $0.eventId == "demo-morning-standup" && $0.kind == .timed
            }) {
                pendingScroll = .revealDocumentY(max(0, standup.frame.top + allDayOffset - 40))
            } else {
                pendingScroll = .revealDocumentY(0)
            }
            didApplyDemoFixtureScroll = true
        }
        applyInitialUIFocusIfNeeded()
    }

    private func applyInitialUIFocusIfNeeded() {
        guard !didApplyInitialUIFocus,
            let eventId = UITestLaunchPolicy.initialGridFocusEventId,
            !loadedEvents.isEmpty,
            focusLayoutCards.contains(where: { $0.eventId == eventId })
        else { return }
        didApplyInitialUIFocus = true
        focusGridEvent(eventId: eventId)
        publishGridFocusAccessibilityProbe(eventId: eventId)
    }

    private func syncFocusRegistry(from scenario: GridLayoutScenario) {
        focusStore.view = viewStore.view
        focusStore.clearRegistry()
        let hasSecondaryTimeZone = viewStore.timeTravelTimeZone != nil
        let colWidths = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: scenario.referenceNow,
            scenario: scenario,
            trackWidth: contentTrackWidth,
            hasSecondaryTimeZone: hasSecondaryTimeZone,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        ).resolvedColumnWidths()
        let cards = GridLayoutSnapshotBuilder.build(
            scenario: scenario,
            colWidths: colWidths,
            hasSecondaryTimeZone: hasSecondaryTimeZone
        ).cards
        let sorted = cards.sorted { lhs, rhs in
            if lhs.frame.top != rhs.frame.top { return lhs.frame.top < rhs.frame.top }
            return lhs.frame.left < rhs.frame.left
        }
        for card in sorted {
            let type: ViewInteractionEventType = card.kind == .allDay ? .allDay : .timed
            focusStore.register(
                eventId: EventId(rawValue: card.eventId),
                eventType: type
            )
        }
    }

    private func nativePageJumpTargets() -> [PageJumpTarget] {
        [
            PageJumpTarget(id: "month-picker", digit: "1", label: "Month picker"),
            PageJumpTarget(id: "calendars", digit: "2", label: "Calendars"),
        ]
    }

    private func buildEventJumpHints() -> [EventJumpChipHint] {
        let digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
        let timed = focusLayoutCards.filter { !$0.isAllDay }.sorted { $0.frame.top < $1.frame.top }
        return timed.prefix(digits.count).enumerated().map { index, card in
            EventJumpChipHint(
                eventId: card.eventId,
                label: digits[index],
                frame: card.frame
            )
        }
    }

    private func visibleCalendars() -> [CompassCalendar] {
        calendars.filter { $0.isVisible && $0.isActive }
    }

    private func scheduleRefreshVisibleRange() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(50))
            guard !Task.isCancelled else { return }
            await self?.refreshVisibleRange()
        }
    }

    private func refreshVisibleRange() async {
        guard isSignedIn, viewStore.view != .life else { return }
        let range = queryRange()
        let key = EventRangeQueryKey(
            scope: viewStore.view == .day ? .day : .week,
            source: .remote,
            start: range.startDate,
            end: range.endDate
        )
        do {
            _ = try await eventsStore.loadRange(key: key)
            loadedEvents = try eventsStore.fetchAllEvents()
            rebuildPresentation()
            await refreshSideband()
        } catch {}
    }

    private func queryRange() -> (startDate: String, endDate: String) {
        if viewStore.view == .day {
            return CalendarWindowMath.dayEventQueryRange(date: startOfView)
        }
        return CalendarWindowMath.weekEventQueryRange(anchor: startOfView)
    }

    private func reloadCalendars() async {
        do {
            let remote = try await environment.apiClient.calendars.list()
            let mapped = remote.map(CompassCalendar.init(listItem:))
            try calendarRepository.upsert(calendars: mapped)
            calendars = try calendarRepository.fetchAll()
            rebuildPresentation()
        } catch {}
    }

    private func bootstrapFixtureSession() async {
        guard let demoSeed else { return }
        let calendar = demoSeed.calendarListItem()
        try? calendarRepository.upsert(calendars: [CompassCalendar(listItem: calendar)])
        calendars = (try? calendarRepository.fetchAll()) ?? []
        await refreshVisibleRange()
    }

    private func configureAnalyticsFromConfig() async {
        await analyticsIdentity.applyPostHogConfig(configStore.config?.posthog)
    }

    private func refreshAfterStreamChange() async {
        await refreshVisibleRange()
        await refreshSideband()
    }

    private func startEventStream() {
        let stream = ServerEventStream(client: environment.apiClient)
        eventStream = stream
        Task {
            await stream.start(
                onMessage: { [weak self] message in
                    Task { @MainActor in
                        try? self?.eventsStore.handleServerMessage(message)
                        await self?.refreshAfterStreamChange()
                    }
                },
                onReopen: { [weak self] in
                    Task { @MainActor in
                        try? self?.eventsStore.handleStreamReopen()
                        await self?.refreshAfterStreamChange()
                    }
                }
            )
        }
    }
}
