import CompassKit
import Foundation
import Observation

@MainActor
@Observable
public final class NativeCalendarRootModel {
    public let viewStore: ViewStore
    public let configStore: ConfigStore
    public let levelsStore: LevelsStore
    public let focusStore: FocusStore
    public let pointerHintStore: PointerHintStore
    public private(set) var headerTitle = ""
    public private(set) var timeGridState: TimeGridState
    public private(set) var calendars: [CompassCalendar] = []
    public private(set) var isSignedIn = false
    public private(set) var contentTrackWidth: CGFloat = 1010
    public internal(set) var sidebandEvents: [Event] = []
    public var onSidebandDidChange: (() -> Void)?
    public var openConferenceURLHandler: ((URL) -> Void)?
    public var onUpNextBannerShown: ((NotifiableEvent) -> Void)?
    public var monthPickerMonth: Date
    public var pendingScroll: TimeGridScrollRequest?
    public var shortcutRegistry: ShortcutRegistry?

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
        levelsStore = environment.levelsStore
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
            pinnedTimeZone: demoSeed?.timeZone
        )
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
        if demoSeed != nil {
            isSignedIn = true
        }
        rebuildPresentation()
    }

    public func start() async {
        await configStore.load()
        await configureAnalyticsFromConfig()
        if demoSeed != nil {
            await bootstrapFixtureSession()
        } else {
            await refreshSignedInState()
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

    public func signIn(email: String, password: String) async throws {
        try await environment.apiClient.auth.signIn(email: email, password: password)
        isSignedIn = true
        await identifyAnalyticsUser()
        startEventStream()
        await reloadCalendars()
        try? await hiddenEventsStore.load()
        await refreshVisibleRange()
        await refreshSideband()
    }

    public func signOut() async throws {
        if let eventStream {
            await eventStream.stop()
        }
        try await environment.apiClient.auth.signOut()
        await resetAnalyticsIdentity()
        isSignedIn = false
        loadedEvents = []
        sidebandEvents = []
        calendars = []
        rebuildPresentation()
    }

    public func updateContentTrackWidth(_ width: CGFloat) {
        let resolved = max(width, 320)
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
            pageWindow(direction: 1)
        case .navPrevious:
            pageWindow(direction: -1)
        case .navToday:
            goToToday()
        case .navShiftLeft:
            shiftViewByDay(-1)
        case .navShiftRight:
            shiftViewByDay(1)
        case .navDayView:
            viewStore.view = .day
            viewStore.setVisibleDayCount(1)
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        case .navWeekView:
            viewStore.view = .week
            rebuildPresentation()
            scheduleRefreshVisibleRange()
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

    public func showPointerHint(for target: PointerClickTarget, registry: ShortcutRegistry) {
        pointerHintStore.pulse(target: target, registry: registry)
    }

    public func handleEventCardPointerDown(eventId: String, registry: ShortcutRegistry) {
        focusEvent(eventId: eventId)
        showPointerHint(for: .eventCard, registry: registry)
    }

    public func focusGridEvent(eventId: String) {
        focusEvent(eventId: eventId)
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
            let focused = focusLayoutCards.first(where: { $0.eventId == focusedId }),
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

        if let seeded = seedFocusEventId() {
            focusEvent(eventId: seeded)
        }
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
            eventJumpHints: eventJumpHintLabels
        )
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

    private func layoutMode() -> GridLayoutMode {
        viewStore.view == .day ? .day : .week
    }

    private func rebuildPresentation() {
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
        let colWidths = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: demoSeed?.referenceNow ?? Date(),
            scenario: scenario,
            trackWidth: contentTrackWidth
        ).resolvedColumnWidths()
        let snapshot = GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: colWidths)
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
            eventJumpHints: eventJumpHintLabels
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
    }

    private func syncFocusRegistry(from scenario: GridLayoutScenario) {
        focusStore.view = viewStore.view
        focusStore.clearRegistry()
        let colWidths = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: scenario.referenceNow,
            scenario: scenario,
            trackWidth: contentTrackWidth
        ).resolvedColumnWidths()
        let cards = GridLayoutSnapshotBuilder.build(
            scenario: scenario,
            colWidths: colWidths
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
        guard isSignedIn else { return }
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
            let remote = try await CalendarsAPI(client: environment.apiClient).list()
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
        isSignedIn = true
        await refreshVisibleRange()
    }

    private func refreshSignedInState() async {
        isSignedIn = (try? await environment.apiClient.currentSession()) != nil
        if isSignedIn {
            await identifyAnalyticsUser()
        }
    }

    private func configureAnalyticsFromConfig() async {
        await analyticsIdentity.applyPostHogConfig(configStore.config?.posthog)
    }

    private func identifyAnalyticsUser() async {
        guard isSignedIn else { return }
        do {
            let profile = try await UserAPI(client: environment.apiClient).profile()
            await analyticsIdentity.identify(userId: profile.userId)
            await analyticsIdentity.trackLoginCompleted()
        } catch {}
    }

    private func resetAnalyticsIdentity() async {
        await analyticsIdentity.resetIdentity()
    }

    private func startEventStream() {
        let stream = ServerEventStream(client: environment.apiClient)
        eventStream = stream
        Task {
            await stream.start(
                onMessage: { [weak self] message in
                    Task { @MainActor in
                        try? self?.eventsStore.handleServerMessage(message)
                        await self?.refreshVisibleRange()
                        await self?.refreshSideband()
                    }
                },
                onReopen: { [weak self] in
                    Task { @MainActor in
                        try? self?.eventsStore.handleStreamReopen()
                        await self?.refreshVisibleRange()
                        await self?.refreshSideband()
                    }
                }
            )
        }
    }
}
