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
    public let lifeStore: LifeStore
    public private(set) var headerTitle = ""
    public private(set) var timeGridState: TimeGridState
    public private(set) var calendars: [CompassCalendar] = []
    public var isSignedIn: Bool { authStore.authenticated }
    public var shortcutRegistry: ShortcutRegistry { environment.shortcutRegistry }
    public private(set) var contentTrackWidth: CGFloat = 1010
    public internal(set) var sidebandEvents: [Event] = []
    public var onSidebandDidChange: (() -> Void)?
    public var openConferenceURLHandler: ((URL) -> Void)?
    public var onUpNextBannerShown: ((NotifiableEvent) -> Void)?
    public var monthPickerMonth: Date

    private let environment: NativeCalendarEnvironment
    let eventsStore: EventsStore
    private let hiddenEventsStore: HiddenEventsStore
    private let calendarRepository: CalendarRepository
    private let demoSeed: DemoSeedFixture?
    private let analyticsIdentity: AnalyticsIdentityCoordinator
    private var eventStream: ServerEventStream?
    var loadedEvents: [Event] = []
    private var refreshTask: Task<Void, Never>?

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
        case .otherSettings:
            settingsStore.open(page: .accounts)
        case .otherTimeTravel:
            settingsStore.openTimezoneDialog(.timeTravel)
        default:
            break
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
        timeGridState = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: demoSeed?.referenceNow ?? Date(),
            scenario: scenario,
            trackWidth: contentTrackWidth,
            hasSecondaryTimeZone: viewStore.timeTravelTimeZone != nil,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        )
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
