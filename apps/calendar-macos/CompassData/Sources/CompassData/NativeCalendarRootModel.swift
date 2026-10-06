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
    public let draftStore: DraftStore
    public let pointerHintStore: PointerHintStore
    public let onboardingStore: OnboardingStore
    public let lifeStore: LifeStore
    public let overlayStores: OverlayStores
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
    /// AppKit title-field probe for native UI tests when the event form is open.
    public var onEventFormTitleAccessibilityProbeChanged: ((Bool) -> Void)?
    public var onEventFormTitleAccessibilityProbeTitleSync: ((String?) -> Void)?
    public var onRecurrenceScopeAccessibilityProbeChanged: ((Bool) -> Void)?
    public var monthPickerMonth: Date
    public var pendingScroll: TimeGridScrollRequest?
    public private(set) var paletteEventSearchHits: [CommandPaletteEventHit] = []
    var paletteSearchTask: Task<Void, Never>?
    public var dedicationDialogVisible = false
    public var pendingDiscardDraftConfirmation = false
    public var pendingRecurrenceScopePrompt: RecurrenceScopePromptKind? {
        didSet {
            onRecurrenceScopeAccessibilityProbeChanged?(pendingRecurrenceScopePrompt != nil)
        }
    }
    public var pendingConvertToStandaloneConfirmation = false
    public var eventFormFocusedField: EventFormField = .title
    public var formFieldDigitHintsVisible = false

    let environment: NativeCalendarEnvironment
    let eventsStore: EventsStore
    private let hiddenEventsStore: HiddenEventsStore
    private let calendarRepository: CalendarRepository
    private let demoPresentation: DemoSeedFixture?
    private var cachedDemoEventIds: Set<String> = []
    private let analyticsIdentity: AnalyticsIdentityCoordinator
    private var eventStream: ServerEventStream?
    var loadedEvents: [Event] = []
    private var refreshTask: Task<Void, Never>?
    private var focusLayoutCards: [FocusLayoutCard] = []
    private var eventJumpHintLabels: [EventJumpChipHint] = []
    private var didApplyDemoFixtureScroll = false
    private var didApplyInitialUIFocus = false
    private var didApplyUITestFocusedEventForm = false
    private var eventFormTitleProbeVisible = false

    public var referenceNow: Date {
        demoPresentation?.referenceNow ?? Date()
    }

    var demoEventIds: Set<String> {
        cachedDemoEventIds.union(demoPresentation?.demoEventIds ?? [])
    }

    public var showsDemoEventsBanner: Bool {
        !demoEventIds.isEmpty && !DemoEventsBannerState.isDismissed(
            repository: environment.userMetadataRepository)
    }

    public init(
        environment: NativeCalendarEnvironment,
        demoPresentation: DemoSeedFixture? = nil,
        overlayStores: OverlayStores = OverlayStores()
    ) {
        self.environment = environment
        self.demoPresentation = demoPresentation
        self.overlayStores = overlayStores
        if let demoPresentation {
            EffectiveTimeZone.identifier = demoPresentation.timeZone
        }
        eventsStore = environment.eventsStore
        hiddenEventsStore = environment.hiddenEventsStore
        calendarRepository = environment.calendarRepository
        configStore = environment.configStore
        authStore = environment.authStore
        billingStore = environment.billingStore
        levelsStore = environment.levelsStore
        lifeStore = LifeStore(today: { demoPresentation?.referenceNow ?? Date() })
        analyticsIdentity = environment.analyticsIdentity

        let anchor: Date = {
            guard let demoPresentation else { return Date() }
            let calendar = EffectiveTimeZone.calendar
            return calendar.dateInterval(of: .weekOfYear, for: demoPresentation.referenceNow)?.start
                ?? demoPresentation.referenceNow
        }()
        viewStore = ViewStore(
            view: .week,
            anchorDate: anchor,
            visibleDayCount: CalendarWindowMath.weekDayCount,
            pinnedTimeZone: demoPresentation?.timeZone
                ?? CompassDevicePreferences.readPinnedTimeZone()
        )
        if demoPresentation == nil {
            viewStore.setTimeTravelTimeZone(CompassDevicePreferences.readTimeTravelTimeZone())
        }
        settingsStore = SettingsStore(viewStore: viewStore)
        monthPickerMonth = anchor
        focusStore = FocusStore(view: .week)
        draftStore = DraftStore()
        pointerHintStore = PointerHintStore()
        onboardingStore = environment.onboardingStore
        timeGridState = TimeGridState(
            layoutMode: .week,
            referenceNow: anchor,
            scenario: GridLayoutSnapshotFixtures.parityScenario(
                layoutMode: .week,
                visibleDateKeys: []
            ),
            trackWidth: 1010
        )
        settingsStore.onDevicePreferencesChanged = { [weak self] in
            self?.rebuildPresentation()
        }
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

    func setPaletteEventSearchHits(_ hits: [CommandPaletteEventHit]) {
        paletteEventSearchHits = hits
    }

    public var activeOnboardingSurface: OnboardingSurfaceKind? {
        OnboardingGating.selectActiveSurface(onboardingSurfaceInput)
    }

    public var connectCalendarProviderKinds: [SignInProviderKind] {
        guard let providers = configStore.config?.providers else { return [] }
        var kinds: [SignInProviderKind] = []
        if providers.google.connect { kinds.append(.google) }
        if providers.microsoft.connect { kinds.append(.microsoft) }
        if providers.apple.connect { kinds.append(.apple) }
        return kinds
    }

    public func openWelcomeGuideFromMenu() {
        onboardingStore.openWelcomeGuide()
    }

    public func connectCalendar(provider: SignInProviderKind) async {
        let mapped: ProviderEnum = switch provider {
        case .google: .google
        case .microsoft: .microsoft
        case .apple: .apple
        }
        await syncConnectionsStore.connect(provider: mapped)
        await syncConnectionsStore.reloadFromMetadata()
    }

    private var onboardingSurfaceInput: OnboardingGating.ActiveSurfaceInput {
        let gateStatus = billingStore.gateStatus
        let showCalendarOnboarding =
            gateStatus == nil &&
            demoPresentation == nil &&
            viewStore.view != .life
        let connectEligible = OnboardingGating.selectConnectCalendarPromptSurfaceEligible(
            authenticated: isSignedIn,
            metadataLoaded: onboardingStore.userMetadataLoaded,
            connectionCount: syncConnectionsStore.connections.count,
            isSnoozed: onboardingStore.isConnectCalendarSnoozed,
            availableProviderCount: connectCalendarProviderKinds.count,
            storageAvailable: true,
            isAuthModalOpen: authStore.isModalPresented,
            isSettingsOpen: settingsStore.isPresented,
            isAboutOpen: false,
            isAppleFormOpen: false,
            isMissingPermissionsOpen: false)
        let firstEventEligible = OnboardingGating.selectFirstEventPromptSurfaceEligible(
            isAuthModalOpen: authStore.isModalPresented,
            isSettingsOpen: settingsStore.isPresented,
            isAboutOpen: false,
            isFormOpen: draftStore.status.isFormOpen,
            isDone: onboardingStore.isFirstEventDone,
            storageAvailable: true,
            showcaseActive: false)
        return OnboardingGating.ActiveSurfaceInput(
            gateStatus: gateStatus,
            isCheckoutCelebrating: false,
            showCalendarOnboarding: showCalendarOnboarding,
            authenticated: isSignedIn,
            isWelcomeFirstVisitOpen: onboardingStore.isWelcomeFirstVisitOpen,
            isWelcomeGuideOpen: onboardingStore.isWelcomeGuideOpen,
            guestMeetingSetupActive: false,
            shortcutShowcaseActive: false,
            connectCalendarEligible: connectEligible,
            firstEventEligible: firstEventEligible,
            pointerHintVisible: pointerHintStore.isVisible,
            pointerHintDismissedPermanently: OnboardingGating.pointerHintDismissedPermanently(),
            isLifeView: viewStore.view == .life)
    }

    public func start() async {
        await configStore.load()
        await configureAnalyticsFromConfig()
        let deferAuthForWelcome = demoPresentation == nil && !onboardingStore.hasSeenWelcome
        await authStore.bootstrap(deferModalUntilWelcomeCompletes: deferAuthForWelcome)
        if demoPresentation != nil {
            authStore.closeModal()
        }
        try? DemoDataSeeder.seedIfNeeded(
            localEvents: environment.localEventRepository,
            metadata: environment.userMetadataRepository,
            fixture: demoPresentation)
        cachedDemoEventIds = (try? environment.localEventRepository.demoEventIds()) ?? []
        applyDemoPresentationTimingIfNeeded()
        try? await hiddenEventsStore.load()
        await reloadCalendars()
        await refreshVisibleRange()
        await refreshSideband()
        if isSignedIn {
            startEventStream()
        }
    }

    public func dismissDemoEventsBanner() {
        try? DemoEventsBannerState.dismiss(repository: environment.userMetadataRepository)
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
        await syncConnectionsStore.reloadFromMetadata()
    }

    public func signOut() async throws {
        try await authStore.signOut()
    }

    private func handleAuthenticated() async {
        billingStore.setAuthenticated(true)
        cachedDemoEventIds = (try? environment.localEventRepository.demoEventIds()) ?? []
        await billingStore.refreshAfterSignIn()
        startEventStream()
        await syncConnectionsStore.reloadFromMetadata()
        onboardingStore.markUserMetadataLoaded()
        onboardingStore.refreshConnectCalendarSnooze()
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
        onboardingStore.resetUserMetadataLoaded()
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
        case .otherPalette:
            toggleCommandPalette()
        case .otherShortcuts:
            toggleShortcutsLegend()
        case .navGoToDate:
            toggleCommandPalette(fromGoToDate: true)
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
        let cards = currentGridCards()
        let resolved =
            gridFocusAccessibilityLabel
            ?? eventId.flatMap { resolveGridFocusLabel(eventId: $0, cards: cards) }
            ?? focusedGridEventAccessibilityLabel()
        if let resolved {
            gridFocusAccessibilityLabel = resolved
        }
        onGridFocusAccessibilityLabelChanged?(resolved)
    }

    public func publishEventFormTitleAccessibilityProbe() {
        let visible = isEventFormVisible
        if visible != eventFormTitleProbeVisible {
            eventFormTitleProbeVisible = visible
            onEventFormTitleAccessibilityProbeChanged?(visible)
            return
        }
        if visible {
            onEventFormTitleAccessibilityProbeTitleSync?(draftStore.gridDraft?.title)
        }
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
        let arrowKey: String = {
            switch direction {
            case .up: return "ArrowUp"
            case .down: return "ArrowDown"
            case .left: return "ArrowLeft"
            case .right: return "ArrowRight"
            }
        }()
        if nudgeDraftOrPlace(key: arrowKey, shiftKey: false, altKey: false) {
            return
        }

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
        guard
            let card = currentGridCards().first(where: { $0.eventId == eventId })
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

    func focusEvent(eventId: String) {
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
        let reference = referenceNow
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
        var scenario = timeGridState.scenario
        scenario.draftOverlay = draftOverlayForPresentation()
        let hasSecondaryTimeZone = viewStore.timeTravelTimeZone != nil
        timeGridState = TimeGridState(
            layoutMode: timeGridState.layoutMode,
            referenceNow: timeGridState.referenceNow,
            scenario: scenario,
            trackWidth: timeGridState.trackWidth,
            focusedEventId: focusStore.focusedEventId?.rawValue,
            sidebarEditingEventId: sidebarEditingGridEventId(),
            eventJumpHints: eventJumpHintLabels,
            hasSecondaryTimeZone: hasSecondaryTimeZone,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        )
        let cards = currentGridCards()
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
        return resolveGridFocusLabel(eventId: focusedId, cards: currentGridCards())
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

    var startOfView: Date {
        EffectiveTimeZone.calendar.startOfDay(for: viewStore.anchorDate)
    }

    var endOfView: Date {
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
            isFormOpen: draftStore.status.isFormOpen,
            isTrialing: billingStore.status?.subscriptionStatus == .trialing)
    }

    private func layoutMode() -> GridLayoutMode {
        viewStore.view == .day ? .day : .week
    }

    func rebuildPresentation() {
        if viewStore.view == .life {
            headerTitle = "Life"
            return
        }
        headerTitle = CalendarHeadingLabel.format(start: startOfView, end: endOfView, now: Date())
        let hiddenIds = Set(hiddenEventsStore.hiddenEventIds.map(\.rawValue))
        let demoIds = demoEventIds
        let referenceNow = self.referenceNow
        var scenario = GridLayoutScenarioBuilder.build(
            layoutMode: layoutMode(),
            visibleDateKeys: visibleDateKeys(),
            referenceNow: referenceNow,
            calendars: visibleCalendars(),
            events: loadedEvents,
            hiddenEventIds: hiddenIds,
            demoEventIds: demoIds
        )
        scenario.draftOverlay = draftOverlayForPresentation()
        let hasSecondaryTimeZone = viewStore.timeTravelTimeZone != nil
        timeGridState = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: referenceNow,
            scenario: scenario,
            trackWidth: contentTrackWidth,
            focusedEventId: focusStore.focusedEventId?.rawValue,
            sidebarEditingEventId: sidebarEditingGridEventId(),
            eventJumpHints: eventJumpHintLabels,
            hasSecondaryTimeZone: hasSecondaryTimeZone,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        )
        let snapshot = timeGridState.snapshot(colWidths: timeGridState.resolvedColumnWidths())
        syncFocusRegistry(from: snapshot.cards)
        focusLayoutCards = snapshot.cards.map { card in
            FocusLayoutCard(
                eventId: card.eventId,
                frame: card.frame,
                isAllDay: card.kind == .allDay
            )
        }
        focusStore.setPageJumpTargets(nativePageJumpTargets())
        if demoPresentation != nil, !loadedEvents.isEmpty, !didApplyDemoFixtureScroll {
            let allDayOffset = GridTimeConstants.timedContentDocumentYOffset(
                allDayRowHeight: snapshot.metrics.allDayRowHeight
            )
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
        publishEventFormTitleAccessibilityProbe()
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
        scheduleUITestFocusedEventFormOpenIfNeeded()
    }

    private func scheduleUITestFocusedEventFormOpenIfNeeded() {
        guard !didApplyUITestFocusedEventForm,
            UITestLaunchPolicy.openFocusedEventFormAfterInitialGridFocus,
            focusStore.focusedEventId != nil
        else { return }
        didApplyUITestFocusedEventForm = true
        Task { @MainActor in
            openKeyboardEditForFocusedEvent()
            openEventFormForCurrentDraft()
            publishEventFormTitleAccessibilityProbe()
        }
    }

    private func currentGridCards() -> [GridLayoutCardSnapshot] {
        timeGridState.snapshot(colWidths: timeGridState.resolvedColumnWidths()).cards
    }

    private func syncFocusRegistry(from cards: [GridLayoutCardSnapshot]) {
        focusStore.view = viewStore.view
        focusStore.clearRegistry()
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

    public func visibleCalendars() -> [CompassCalendar] {
        calendars.filter { $0.isVisible && $0.isActive }
    }

    func defaultTargetCalendarId() -> CalendarId? {
        if let demoPresentation {
            return CalendarId(rawValue: demoPresentation.calendarId)
        }
        guard let calendar = visibleCalendars().first(where: { $0.capabilities.canWrite }) else {
            return nil
        }
        return CalendarId(rawValue: calendar.id)
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
        guard viewStore.view != .life else { return }
        let source = eventsStore.source
        guard isSignedIn || source == .local else { return }
        let range = queryRange()
        let key = EventRangeQueryKey(
            scope: viewStore.view == .day ? .day : .week,
            source: source,
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
        if eventsStore.source == .local, !isSignedIn {
            await bootstrapAnonymousCalendarsIfNeeded()
            return
        }
        do {
            let remote = try await environment.apiClient.calendars.list()
            let mapped = remote.map(CompassCalendar.init(listItem:))
            try calendarRepository.upsert(calendars: mapped)
            calendars = try calendarRepository.fetchAll()
            rebuildPresentation()
        } catch {}
    }

    private func bootstrapAnonymousCalendarsIfNeeded() async {
        do {
            if let demoPresentation {
                let calendar = CompassCalendar(listItem: demoPresentation.calendarListItem())
                try calendarRepository.upsert(calendars: [calendar])
            } else {
                let sentinel = try LocalCalendarSentinel.calendarId(
                    repository: environment.userMetadataRepository)
                let calendar = LocalCalendarSentinel.synthesizeCalendar(id: sentinel)
                try calendarRepository.upsert(calendars: [calendar])
            }
            calendars = try calendarRepository.fetchAll()
            rebuildPresentation()
        } catch {}
    }

    private func applyDemoPresentationTimingIfNeeded() {
        guard demoPresentation != nil || eventsStore.source == .local else { return }
        guard let fixture = demoPresentation ?? (try? DemoSeedFixture.load()) else { return }
        EffectiveTimeZone.identifier = fixture.timeZone
        let calendar = EffectiveTimeZone.calendar
        let weekStart = calendar.dateInterval(of: .weekOfYear, for: fixture.referenceNow)?.start
            ?? fixture.referenceNow
        viewStore.setAnchorDate(weekStart)
        monthPickerMonth = weekStart
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
