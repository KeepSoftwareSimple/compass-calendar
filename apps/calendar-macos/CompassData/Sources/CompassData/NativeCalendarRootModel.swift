import CompassKit
import Foundation
import Observation
import os

@MainActor
@Observable
public final class NativeCalendarRootModel {
    static let log = Logger(subsystem: "com.compass.calendar", category: "NativeCalendarRootModel")
    public let viewStore: ViewStore
    public let configStore: ConfigStore
    public let authStore: AuthStore
    public let billingStore: BillingStore
    public let bookingStore: BookingStore
    public let settingsStore: SettingsStore
    public var syncConnectionsStore: SyncConnectionsStore { environment.syncConnectionsStore }
    public let levelsStore: LevelsStore
    public let focusStore: FocusStore
    public let draftStore: DraftStore
    public let pointerHintStore: PointerHintStore
    public let onboardingStore: OnboardingStore
    public let blockPartyStore: BlockPartyStore
    public let lifeStore: LifeStore
    public let lifeViewIntroStore: LifeViewIntroStore
    public let overlayStores: OverlayStores
    public private(set) var headerTitle = ""
    public private(set) var timeGridState: TimeGridState
    /// Title of the focused grid event for native UI tests and accessibility probes.
    public private(set) var gridFocusAccessibilityLabel: String?
    public private(set) var calendars: [CompassCalendar] = []
    var localCalendarId: String?
    public var isSignedIn: Bool { authStore.authenticated }
    public var shortcutRegistry: ShortcutRegistry { environment.shortcutRegistry }
    public private(set) var contentTrackWidth: CGFloat = 1010
    private var hasResolvedInitialContentWidth = false
    public internal(set) var sidebandEvents: [Event] = []
    public var onSidebandDidChange: (() -> Void)?
    public var openExternalURLHandler: ((URL) -> Void)?
    var pendingBookingCancellation: BookingEventActionContext?
    public internal(set) var isCancellingBookedMeeting = false
    public var onUpNextBannerShown: ((NotifiableEvent) -> Void)?
    /// Window-level accessibility probe for native UI tests (see Compass app).
    public var onGridFocusAccessibilityLabelChanged: ((String?) -> Void)?
    /// AppKit title-field probe for native UI tests when the event form is open.
    public var onEventFormTitleAccessibilityProbeChanged: ((Bool) -> Void)?
    public var onEventFormTitleAccessibilityProbeTitleSync: ((String?) -> Void)?
    public var onRecurrenceScopeAccessibilityProbeChanged: ((Bool) -> Void)?
    public var onStatusToastAccessibilityProbeChanged: ((Bool) -> Void)?
    public var onShortcutsLegendAccessibilityProbeChanged: ((Bool) -> Void)?
    public var onEventJumpChipsAccessibilityProbeChanged: (([EventJumpChipHint]) -> Void)?
    public var monthPickerMonth: Date
    public var pendingScroll: TimeGridScrollRequest?
    /// True for 700ms after an already-at-now teach pulse. Matches web `NOW_CUE_PULSE_MS`.
    public private(set) var nowCueHeaderHighlight = false
    private var nowCuePulseTask: Task<Void, Never>?
    public private(set) var paletteEventSearchHits: [CommandPaletteEventHit] = []
    var sessionRevision = 0
    var paletteSearchTask: Task<Void, Never>?
    var paletteEventSearchEvents: [String: Event] = [:]
    public var dedicationDialogVisible = false
    /// Right-hand sidebar, toggled with `]` like the web. Kept between launches.
    public var isSidebarOpen = CompassDevicePreferences.readSidebarOpen() {
        didSet { CompassDevicePreferences.writeSidebarOpen(isSidebarOpen) }
    }
    /// When the live event stream first dropped; nil while it is connected.
    public internal(set) var streamTroubleSince: Date?
    /// Sidebar width in points, dragged between 240 and 480 like the web.
    public private(set) var sidebarWidth = CompassDevicePreferences.readSidebarWidth()
    /// Month picker day holding keyboard focus after `i`, like the web's
    /// focused datepicker day. Nil when the picker does not have focus.
    public internal(set) var monthPickerFocusDate: Date?
    /// Banner holding keyboard focus after `p`, like the web's `data-notice` focus.
    public internal(set) var focusedNotice: NativeNotice?
    /// Calendar list whose rows take number keys, like the web's focused
    /// account section. Nil when no list has focus.
    public internal(set) var focusedCalendarListKey: String?
    /// Digests of the account sections collapsed in the sidebar, kept between
    /// launches. Digests, not keys, so account emails stay out of preferences.
    var collapsedAccountDigests = Set(
        UserDefaults.standard.stringArray(forKey: NativeCalendarRootModel.collapsedAccountsKey) ?? [])
    public var pendingDiscardDraftConfirmation = false
    public var pendingRecurrenceScopePrompt: RecurrenceScopePromptKind? {
        didSet {
            onRecurrenceScopeAccessibilityProbeChanged?(pendingRecurrenceScopePrompt != nil)
        }
    }
    public var pendingConvertToStandaloneConfirmation = false
    public var invitationPrompt: EventInvitationPromptState?
    public var pendingRsvpChoice: PendingRsvpChoice?
    public var attendeeSuggestions: [DraftAttendeeInput] = []
    public var attendeeSuggestionQuery = ""
    var attendeeSuggestionTask: Task<Void, Never>?
    var _contactSuggestionDebouncer: ContactSuggestionDebouncer?
    var pendingInvitationDraft: GridEventDraft?
    var pendingSaveInvitation: InvitationEnum?
    public var isGuestEmailInputFocused = false
    /// The form date field owning Return (and its open calendar's keys); the key router lets them through.
    public var eventFormDateKeyOwner: EventFormDateFieldKeys.Owner?
    public var eventFormTimeKeyOwner: String?
    public var eventFormFocusedField: EventFormField = .title
    public internal(set) var eventFormActionsFocusRequest = 0
    public var isEventFormActionFocused = false
    /// Keyboard focus inside the color swatches while `eventFormFocusedField == .color`.
    public internal(set) var colorSwatchFocusIndex = 0
    public var formFieldDigitHintsVisible = false
    /// Set when Sparkle has staged an update; cleared after restart prompt dismisses.
    public var desktopUpdateReadyVersion: String?
    public var onDesktopRestartToUpdate: (() -> Void)?

    let environment: NativeCalendarEnvironment
    let eventsStore: EventsStore
    private let hiddenEventsStore: HiddenEventsStore
    public let calendarVisibilityStore: CalendarVisibilityStore
    private let calendarRepository: CalendarRepository
    private let demoPresentation: DemoSeedFixture?
    private let now: () -> Date
    private var cachedDemoEventIds: Set<String> = []
    /// Web `TIMEZONE_MISMATCH_SNOOZED_BROWSER`: the device zone "Keep" was chosen for.
    var timezoneMismatchSnoozedFor = UserDefaults.standard.string(
        forKey: CompassStorageKeys.timezoneMismatchSnoozedBrowser)
    /// Observed copy of `DemoEventsBannerState` so dismissing re-renders.
    private var isDemoEventsBannerDismissed = false
    private let analyticsIdentity: AnalyticsIdentityCoordinator
    private var eventStream: ServerEventStream?
    /// Every reload (saves, drafts, deletes, undo) also refreshes Up next, so a
    /// new event shows there at once instead of on the next sideband tick.
    var loadedEvents: [Event] = [] {
        didSet { syncSidebandWithLoadedEvents() }
    }
    private var refreshTask: Task<Void, Never>?
    private var focusLayoutCards: [FocusLayoutCard] = []
    var eventJumpHintLabels: [EventJumpChipHint] = []
    var quickTimeSlotHintLabels: [QuickTimeSlotHint] = []
    public var focusedDayColumnCalendarId: String?
    public var pendingFocusDayColumnCalendarId: String?
    private var didApplyDemoFixtureScroll = false
    private var didApplyInitialUIFocus = false
    private var didApplyUITestFocusedEventForm = false
    private var eventFormTitleProbeVisible = false
    var keyboardCreateSettleGeneration = 0
    var quickAddPanelSession: QuickAddPanelSession?
    public internal(set) var quickAddError: String?
    var blockPartyModHoldTask: Task<Void, Never>?
    var eventJumpCommitTask: Task<Void, Never>?
    /// Digits typed after a day pick, for web's typed-time create on that column.
    @ObservationIgnored var eventJumpTimeBurstDigits = ""
    /// When the last digit handler finished; gaps measure idle time between key events.
    @ObservationIgnored var eventJumpTimeBurstEndedAt: Date?
    /// Parked create target after an empty-grid click (web `event-jump.store` pointer draft).
    @ObservationIgnored var pointerDraftDateKey: String?
    @ObservationIgnored var pointerDraftStartISO: String?
    @ObservationIgnored var pointerDraftTimeKey: String?

    public var referenceNow: Date {
        demoPresentation?.referenceNow ?? now()
    }

    /// `-COMPASS_FIXTURE demo`: onboarding nudges stay out of the way like `showCalendarOnboarding`.
    var isDemoFixture: Bool { demoPresentation != nil }

    var demoEventIds: Set<String> {
        cachedDemoEventIds.union(demoPresentation?.demoEventIds ?? [])
    }

    public func resizeSidebar(to width: Double) {
        sidebarWidth = CompassDevicePreferences.clampSidebarWidth(width)
    }

    /// Saves the width once a drag ends, not on every frame.
    public func saveSidebarWidth() {
        CompassDevicePreferences.writeSidebarWidth(sidebarWidth)
    }

    public var showsDemoEventsBanner: Bool {
        !demoEventIds.isEmpty && !isDemoEventsBannerDismissed
    }

    public init(
        environment: NativeCalendarEnvironment,
        demoPresentation: DemoSeedFixture? = nil,
        overlayStores: OverlayStores = OverlayStores(),
        now: @escaping () -> Date = Date.init
    ) {
        self.environment = environment
        self.demoPresentation = demoPresentation
        self.now = now
        self.overlayStores = overlayStores
        // Demo matches web parity: effective UTC via browser timezone, not a pinned override.
        let demoTimeZone = demoPresentation?.timeZone
        let pinnedTimeZone =
            demoPresentation == nil
            ? CompassDevicePreferences.readPinnedTimeZoneResolvingAccidentalUtc()
            : nil
        EffectiveTimeZone.identifier =
            demoTimeZone ?? pinnedTimeZone ?? TimeZone.current.identifier
        eventsStore = environment.eventsStore
        hiddenEventsStore = environment.hiddenEventsStore
        calendarVisibilityStore = CalendarVisibilityStore()
        calendarRepository = environment.calendarRepository
        configStore = environment.configStore
        authStore = environment.authStore
        billingStore = environment.billingStore
        bookingStore = environment.bookingStore
        levelsStore = environment.levelsStore
        lifeStore = LifeStore(today: { demoPresentation?.referenceNow ?? now() })
        lifeViewIntroStore = LifeViewIntroStore(
            userAPI: UserAPI(client: environment.apiClient),
            analytics: environment.productAnalytics)
        analyticsIdentity = environment.analyticsIdentity

        let anchor: Date = {
            let today = demoPresentation?.referenceNow ?? now()
            return CalendarWindowMath.sundayWeekViewStart(containing: today)
        }()
        viewStore = ViewStore(
            view: .week,
            anchorDate: anchor,
            visibleDayCount: CalendarWindowMath.weekDayCount,
            pinnedTimeZone: pinnedTimeZone,
            browserTimeZone: demoTimeZone ?? TimeZone.current.identifier
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
        blockPartyStore = environment.blockPartyStore
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
        eventsStore.onWriteLanded = { [weak self] isNewCreate in
            self?.noteEventWriteLanded(isNewCreate: isNewCreate)
        }
        authStore.onAuthenticated = { [weak self] in
            await self?.handleAuthenticated()
        }
        authStore.onSignedOut = { [weak self] in
            await self?.handleSignedOut()
        }
        billingStore.setAuthenticated(authStore.authenticated)
        billingStore.attach(settingsStore: settingsStore)
        bookingStore.setAuthenticated(authStore.authenticated)
        overlayStores.statusToast.onVisibilityChanged = { [weak self] visible in
            self?.onStatusToastAccessibilityProbeChanged?(visible)
        }
        overlayStores.legend.onOpenChanged = { [weak self] open in
            self?.onShortcutsLegendAccessibilityProbeChanged?(open)
        }
        if UITestLaunchPolicy.isParityCapture {
            applyParityCapturePresentationIfNeeded()
        } else {
            rebuildPresentation()
        }
    }

    public func closeSettingsIfAllowed() {
        let writableCount = bookingStore.writableCalendars(
            from: calendars,
            hasConnectedAccount: !syncConnectionsStore.connections.isEmpty
        ).count
        if bookingStore.attemptDismissSettings(writableCalendarCount: writableCount) {
            return
        }
        settingsStore.close()
    }

    public func openBookingSettings() {
        settingsStore.open(page: .booking)
        Task {
            await refreshBookingSettingsContent()
        }
    }

    public func beginGuestMeetingSetup() {
        settingsStore.beginGuestMeetingSetup()
        bookingStore.seedGuestPreviewIfNeeded()
    }

    public func refreshBookingSettingsContent() async {
        if settingsStore.guestMeetingSetupActive, !isSignedIn {
            bookingStore.seedGuestPreviewIfNeeded()
            return
        }
        await bookingStore.refreshPageIfNeeded()
        bookingStore.seedFormIfNeeded(
            calendars: calendars,
            hasConnectedAccount: !syncConnectionsStore.connections.isEmpty
        )
        bookingStore.trackSettingsOpenedIfNeeded(
            hasConnection: !syncConnectionsStore.connections.isEmpty
        )
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

    public var connectableCalendarProviders: [ProviderEnum] {
        connectCalendarProviderKinds.map(\.calendarConnectProvider)
    }

    public func openWelcomeGuideFromMenu() {
        onboardingStore.openWelcomeGuide()
    }

    public func connectCalendar(provider: SignInProviderKind) async {
        if provider == .apple {
            await syncConnectionsStore.connectAppleViaEventKit()
            await reloadCalendars()
            await refreshVisibleRange()
            return
        }
        await syncConnectionsStore.connect(provider: provider.calendarConnectProvider)
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
            showcaseActive: blockPartyStore.isActive)
        return OnboardingGating.ActiveSurfaceInput(
            gateStatus: gateStatus,
            isCheckoutCelebrating: false,
            showCalendarOnboarding: showCalendarOnboarding,
            authenticated: isSignedIn,
            isWelcomeFirstVisitOpen: onboardingStore.isWelcomeFirstVisitOpen,
            isWelcomeGuideOpen: onboardingStore.isWelcomeGuideOpen,
            guestMeetingSetupActive: settingsStore.guestMeetingSetupActive,
            shortcutShowcaseActive: blockPartyStore.isActive,
            connectCalendarEligible: connectEligible,
            firstEventEligible: firstEventEligible && !onboardingStore.defersFirstEventPromptForSignUpNudge,
            pointerHintVisible: pointerHintStore.isVisible,
            pointerHintDismissedPermanently: OnboardingGating.pointerHintDismissedPermanently(),
            isLifeView: viewStore.view == .life)
    }

    public func start() async {
        await configStore.load()
        await configureAnalyticsFromConfig()
        await authStore.bootstrap()
        if demoPresentation != nil {
            authStore.closeModal()
        }
        if isSignedIn, (try? AccountCacheIdentity.matches(userId: authStore.userId, repository: environment.userMetadataRepository)) != true {
            guard resetAccountCaches(discardDraft: false) else { return }
        }
        try? DemoDataSeeder.seedIfNeeded(
            localEvents: environment.localEventRepository,
            metadata: environment.userMetadataRepository,
            fixture: demoPresentation)
        cachedDemoEventIds = (try? environment.localEventRepository.demoEventIds()) ?? []
        isDemoEventsBannerDismissed = DemoEventsBannerState.isDismissed(
            repository: environment.userMetadataRepository)
        try? await hiddenEventsStore.load()
        await reloadCalendars()
        await refreshVisibleRange()
        await refreshSideband()
        applyParityCapturePresentationIfNeeded()
        if UITestLaunchPolicy.showPageJumpHintsForUITest {
            setPageJumpHintsVisible(true)
        }
        if UITestLaunchPolicy.activateEventJumpForUITest {
            activateEventJumpMode()
        }
        if isSignedIn {
            startEventStream()
        }
    }

    /// Match web parity captures: five day columns @ 1280×820 and demo-seed scroll position.
    func applyParityCapturePresentationIfNeeded() {
        guard UITestLaunchPolicy.isParityCapture else { return }
        viewStore.view = .week
        isSidebarOpen = true
        sidebarWidth = CGFloat(ParityCaptureGeometry.defaultSidebarWidth)
        contentTrackWidth = CGFloat(ParityCaptureGeometry.contentTrackWidth)
        viewStore.setVisibleDayCount(ParityCaptureGeometry.visibleDayCount)
        let today = referenceNow
        viewStore.setAnchorDate(CalendarWindowMath.sundayWeekViewStart(containing: today))
        monthPickerMonth = today
        draftStore.discard()
        levelsStore.pinShortcutTip(id: "focus-page-jump")
        pendingScroll = .scrollToNowOrPulse
        rebuildPresentation()
        scheduleRefreshVisibleRange()
        onParityCapturePresentationApplied?()
    }

    public func dismissDemoEventsBanner() {
        try? DemoEventsBannerState.dismiss(repository: environment.userMetadataRepository)
        isDemoEventsBannerDismissed = true
    }

    var hasSampleEvents: Bool { !cachedDemoEventIds.isEmpty }

    /// Web `clearDemoEvents` from the palette: deletes seeded rows and dismisses the banner.
    public func clearSampleEvents() async {
        let ids = (try? environment.localEventRepository.demoEventIds()) ?? []
        try? environment.localEventRepository.delete(ids: ids.map { EventId(rawValue: $0) })
        cachedDemoEventIds = []
        dismissDemoEventsBanner()
        await refreshVisibleRange()
        await refreshSideband()
        guard !ids.isEmpty else { return }
        statusToastStore.show(
            id: "clear-demo-events",
            message: ids.count == 1 ? "Removed 1 sample event" : "Removed \(ids.count) sample events")
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
        refreshLifeViewIntro()
    }

    public var onParityCapturePresentationApplied: (() -> Void)?
    public var onShowAbout: (() -> Void)?
    /// Delivers feedback details and the current view name; throws when sending fails.
    public var feedbackSender: ((String, String) async throws -> Void)?
    public internal(set) var isFeedbackDialogPresented = false
    public internal(set) var isFeedbackSubmitting = false
    public var onExportLocalData: ((Data, String) async throws -> Bool)?
    public internal(set) var isExportingLocalData = false
    public internal(set) var pendingLogoutConfirmation = false
    public internal(set) var pendingDeleteAccountConfirmation = false
    public internal(set) var isDeletingAccount = false
    public internal(set) var deleteAccountError: String?
    public internal(set) var isLoggingOut = false
    public internal(set) var logoutError: String?

    public func signOut() async throws {
        try await authStore.signOut()
    }

    private func handleAuthenticated() async {
        guard resetAccountCaches(discardDraft: false) else { return }
        let revision = sessionRevision
        billingStore.setAuthenticated(true)
        bookingStore.setAuthenticated(true)
        cachedDemoEventIds = (try? environment.localEventRepository.demoEventIds()) ?? []
        await billingStore.refreshAfterSignIn()
        guard revision == sessionRevision, isSignedIn else { return }
        await bookingStore.refreshPageIfNeeded()
        guard revision == sessionRevision, isSignedIn else { return }
        startEventStream()
        await syncConnectionsStore.reloadFromMetadata()
        guard revision == sessionRevision, isSignedIn else { return }
        onboardingStore.markUserMetadataLoaded()
        onboardingStore.refreshConnectCalendarSnooze()
        levelsStore.mergeHintShortcutCelebration(
            hintFirstUsed: syncConnectionsStore.lastLoadedMetadata?.shortcuts?.hintFirstUsed)
        refreshLifeViewIntro()
        await reloadCalendars()
        guard revision == sessionRevision, isSignedIn else { return }
        try? await hiddenEventsStore.load()
        guard revision == sessionRevision, isSignedIn else { return }
        await refreshVisibleRange()
        guard revision == sessionRevision, isSignedIn else { return }
        await refreshSideband()
        guard revision == sessionRevision, isSignedIn else { return }
        if GuestMeetingSetupDraftStorage.read() != nil {
            settingsStore.beginGuestMeetingSetup()
            bookingStore.resumeGuestMeetingSetupIfNeeded(
                calendars: calendars,
                hasConnectedAccount: !syncConnectionsStore.connections.isEmpty
            )
        }
    }

    func refreshCalendarsAndVisibleRange() async {
        await reloadCalendars()
        await refreshVisibleRange()
    }

    private func handleSignedOut() async {
        let cachesReady = resetAccountCaches()
        let revision = sessionRevision
        billingStore.setAuthenticated(false)
        bookingStore.setAuthenticated(false)
        settingsStore.close()
        onboardingStore.resetUserMetadataLoaded()
        if let eventStream {
            await eventStream.stop()
        }
        guard revision == sessionRevision else { return }
        streamTroubleSince = nil
        if cachesReady, eventsStore.source == .local {
            await reloadCalendars()
            await refreshVisibleRange()
            await refreshSideband()
        }
    }

    private func resetAccountCaches(discardDraft: Bool = true) -> Bool {
        sessionRevision += 1
        keyboardCreateSettleGeneration += 1
        quickAddPanelSession = nil
        quickAddError = nil
        refreshTask?.cancel()
        resetPaletteEventSearch()
        commandPaletteStore.close()
        syncConnectionsStore.resetSession()
        if discardDraft { draftStore.discard() }
        undoStore.clear()
        loadedEvents = []
        isGuestEmailInputFocused = false
        eventFormDateKeyOwner = nil
        eventFormTimeKeyOwner = nil
        sidebandEvents = []
        pendingBookingCancellation = nil
        isCancellingBookedMeeting = false
        calendars = []
        rebuildPresentation()
        do {
            try eventsStore.resetRemoteSession()
            var localIds = try calendarIdsOwnedByLocalEvents()
            let localId = try LocalCalendarSentinel.calendarId(repository: environment.userMetadataRepository)
            localIds.insert(demoPresentation?.calendarId ?? localId.rawValue)
            try calendarRepository.removeCachedCalendars(except: localIds)
            try AccountCacheIdentity.record(userId: authStore.userId, repository: environment.userMetadataRepository)
            return true
        } catch {
            statusToastStore.show(id: "session-cache-error", message: "Could not refresh calendar data. Try logging in again.")
            return false
        }
    }

    public func updateContentTrackWidth(_ width: CGFloat) {
        if UITestLaunchPolicy.isParityCapture {
            let resolved = max(width, CGFloat(ParityCaptureGeometry.contentTrackWidth))
            if abs(resolved - contentTrackWidth) > 0.5 {
                contentTrackWidth = resolved
                viewStore.setVisibleDayCount(ParityCaptureGeometry.visibleDayCount)
                rebuildPresentation()
                scheduleRefreshVisibleRange()
            }
            return
        }
        let resolved = max(UITestLaunchPolicy.pinnedWeekGridTrackWidth ?? width, 320)
        let initialLayout = !hasResolvedInitialContentWidth
        hasResolvedInitialContentWidth = true
        if initialLayout || abs(resolved - contentTrackWidth) > 0.5 {
            contentTrackWidth = resolved
            let count = CalendarWindowMath.computeVisibleDayCount(trackWidth: Double(resolved))
            viewStore.setVisibleDayCount(count)
            if initialLayout, demoPresentation == nil, viewStore.view == .week,
                EffectiveTimeZone.calendar.isDate(viewStore.anchorDate,
                    inSameDayAs: CalendarWindowMath.sundayWeekViewStart(containing: referenceNow)) {
                viewStore.setAnchorDate(currentWeekWindowStart())
                monthPickerMonth = viewStore.anchorDate
            }
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        }
    }

    /// Records a shortcut invocation for the levels/tips telemetry, if the id
    /// belongs to a section. Every shortcut handler funnels through here so the
    /// `section(for:)` lookup lives in one place.
    public func recordShortcut(_ id: ShortcutId) {
        guard let section = ShortcutTelemetrySection.section(for: id) else { return }
        levelsStore.recordShortcutInvocation(id, section: section)
        noteShortcutEngagementIfAnonymous()
    }

    public func handleShortcut(_ id: ShortcutId) {
        if id == .createTimed || id == .createAllday {
            guard !settingsStore.isPresented, !authStore.isModalPresented,
                  !pendingLogoutConfirmation, !pendingDiscardDraftConfirmation,
                  billingStore.gateStatus == nil else { return }
        }
        recordShortcut(id)
        switch id {
        case .createTimed, .createAllday:
            if viewStore.view == .life {
                viewStore.view = .week
                scheduleRefreshVisibleRange()
            }
            if id == .createTimed { createTimedDraft(activity: .createShortcut) }
            else { createAllDayDraft() }
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
        case .navMonthCurrent:
            goToMonthPickerCurrentMonth()
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
        case .otherSidebar:
            isSidebarOpen.toggle()
        case .focusSidebar:
            focusSidebar()
        case .focusEvent:
            focusFirstCalendarEvent()
        case .focusNotice:
            focusNextNotice()
        case .focusShiftHold:
            if eventJumpSelection.modeActive {
                _ = handleEventJumpKeystroke("f")
            } else {
                activateEventJumpMode()
            }
        case .otherSubscribe:
            openUpgradeConfirmation()
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
        rebuildPresentation()
    }

    public func focusDayColumn(calendarId: String) {
        focusedDayColumnCalendarId = calendarId
        pendingFocusDayColumnCalendarId = calendarId
        applyFocusPresentation()
    }

    public func setEventJumpHintsVisible(_ visible: Bool) {
        if visible {
            eventJumpHintLabels = buildEventJumpHints()
        } else if !eventJumpSelection.modeActive {
            eventJumpHintLabels = []
        }
        applyFocusPresentation()
    }

    public func showPointerHint(
        for target: PointerClickTarget,
        registry: ShortcutRegistry,
        slotClick: GridPointerSlotClickContext? = nil,
        focusedGridEventLabel: String? = nil
    ) {
        var resolvedFocusLabel = focusedGridEventLabel
        if target == .eventCard, resolvedFocusLabel == nil {
            resolvedFocusLabel = gridFocusAccessibilityLabel ?? focusedGridEventAccessibilityLabel()
        }
        pointerHintStore.pulse(
            target: target,
            registry: registry,
            slotClick: slotClick,
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

    /// Web `view-select` page jump opens the view dropdown, like clicking it.
    public var isViewSwitcherOpen = false

    public func focusPageJump(digit: Character) {
        guard let target = focusStore.pageJumpTargets.first(where: { $0.digit == String(digit) }) else {
            return
        }
        switch target.id {
        case "view-select":
            isViewSwitcherOpen = true
        case "up-next":
            // Web focuses the Up next card so Enter opens it; with no event the digit does nothing.
            openUpNextEvent()
        case "month-picker":
            monthPickerMonth = viewStore.anchorDate
        case "calendars":
            focusCalendarList()
        case let id where id.hasPrefix(PageJumpTargets.calendarAccountPrefix):
            // Web clicks a collapsed heading so the jump shows its calendars.
            let key = String(id.dropFirst(PageJumpTargets.calendarAccountPrefix.count))
            if isAccountCollapsed(key) {
                toggleAccountCollapsed(key)
            }
            focusCalendarList(key)
        case let id where id.hasPrefix(PageJumpTargets.dayColumnPrefix):
            let calendarId = String(id.dropFirst(PageJumpTargets.dayColumnPrefix.count))
            focusDayColumn(calendarId: calendarId)
        default:
            break
        }
    }

    public func consumePendingScroll() -> TimeGridScrollRequest? {
        defer { pendingScroll = nil }
        return pendingScroll
    }

    public func registerNowCuePulse() {
        guard viewStore.view != .life else { return }
        nowCuePulseTask?.cancel()
        nowCueHeaderHighlight = true
        nowCuePulseTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            self?.nowCueHeaderHighlight = false
        }
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

    /// Web `onFocusCalendar` / `u`: seed grid focus on the nearest event when nothing is focused.
    public func focusFirstCalendarEvent() {
        guard viewStore.view != .life else { return }
        guard focusStore.focusedEventId == nil else { return }
        if let seeded = seedFocusEventId() {
            focusEvent(eventId: seeded)
        }
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

    func applyFocusPresentation() {
        var scenario = timeGridState.scenario
        scenario.draftOverlay = draftOverlayForPresentation()
        scenario.pinnedDayColumnCalendarIds = pinnedDayColumnCalendarIds()
        scenario.defaultTargetCalendarId = defaultTargetCalendarId()?.rawValue
        let hasSecondaryTimeZone = viewStore.timeTravelTimeZone != nil
        let eventJumpActive = eventJumpSelection.modeActive || eventJumpSelection.isActive
        let showDayJumpPrefixes =
            !isEventFormVisible && (focusStore.pageJumpHintsVisible || eventJumpActive)
        timeGridState = TimeGridState(
            layoutMode: timeGridState.layoutMode,
            referenceNow: timeGridState.referenceNow,
            scenario: scenario,
            trackWidth: timeGridState.trackWidth,
            focusedEventId: focusStore.focusedEventId?.rawValue,
            sidebarEditingEventId: sidebarEditingGridEventId(),
            eventJumpHints: eventJumpHintLabels,
            quickTimeSlotHints: quickTimeSlotHintLabels,
            focusedDayColumnCalendarId: focusedDayColumnCalendarId,
            pageJumpHintsVisible: focusStore.pageJumpHintsVisible,
            pageJumpDigitByCalendarId: pageJumpDigitByCalendarId(),
            showDayJumpPrefixes: showDayJumpPrefixes,
            dayJumpUseShiftPrefix: !eventJumpSelection.modeActive,
            eventJumpActiveDayKeys: eventJumpSelection.activeDayKeys,
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
            // Web `MonthPicker` follows the view into the month it lands in.
            monthPickerMonth = next
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        }
    }

    private func shiftViewByDay(_ days: Int) {
        let calendar = EffectiveTimeZone.calendar
        if let next = calendar.date(byAdding: .day, value: days, to: startOfView) {
            viewStore.setAnchorDate(next)
            monthPickerMonth = next
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        }
    }

    private func goToToday() {
        let today = referenceNow
        let calendar = EffectiveTimeZone.calendar
        var anchorChanged = false
        if viewStore.visibleDayCount == 1 {
            if !calendar.isDate(viewStore.anchorDate, inSameDayAs: today) {
                viewStore.setAnchorDate(today)
                anchorChanged = true
            }
        } else if !isReferenceDayInVisibleWindow(today) {
            viewStore.setAnchorDate(currentWeekWindowStart())
            anchorChanged = true
        }
        monthPickerMonth = today
        if anchorChanged {
            rebuildPresentation()
            scheduleRefreshVisibleRange()
        }
        // Web `goToTodayInWeek` always runs scroll-to-now / now-cue even when the anchor is unchanged.
        pendingScroll = .scrollToNowOrPulse
    }

    /// Keep today inside partial-week windows, retaining Sunday for a full week.
    private func currentWeekWindowStart() -> Date {
        let calendar = EffectiveTimeZone.calendar
        let weekStart = CalendarWindowMath.sundayWeekViewStart(containing: referenceNow)
        let dayIndex = calendar.dateComponents([.day], from: weekStart,
            to: calendar.startOfDay(for: referenceNow)).day ?? 0
        let offset = CalendarWindowMath.computeVisibleWindowOffset(anchorIndex: dayIndex,
            visibleDayCount: viewStore.visibleDayCount)
        return calendar.date(byAdding: .day, value: offset, to: weekStart) ?? weekStart
    }

    /// Matches web `useWeek` `isCurrentWeek` before `goToToday` moves the anchor.
    private func isReferenceDayInVisibleWindow(_ day: Date) -> Bool {
        let calendar = EffectiveTimeZone.calendar
        let dayStart = calendar.startOfDay(for: day)
        return dayStart >= startOfView && dayStart <= endOfView
    }

    private func shiftMonth(by months: Int) {
        let calendar = EffectiveTimeZone.calendar
        if let next = calendar.date(byAdding: .month, value: months, to: monthPickerMonth) {
            browseMonth(next)
        }
    }

    /// Web `Mod+Alt+T` / sidebar "Go to this month": move the picker to the
    /// current month without changing the main grid anchor.
    private func goToMonthPickerCurrentMonth() {
        browseMonth(referenceNow)
    }

    public var startOfView: Date {
        EffectiveTimeZone.calendar.startOfDay(for: viewStore.anchorDate)
    }

    public var endOfView: Date {
        let calendar = EffectiveTimeZone.calendar
        return calendar.date(
            byAdding: .day,
            value: max(viewStore.visibleDayCount, 1) - 1,
            to: startOfView
        ) ?? startOfView
    }

    func visibleDateKeys() -> [String] {
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

    /// Web `gridEventCardClassName` dashed outline: samples, plus events this
    /// account organizes whose guests are still awaiting or tentative.
    private func unsettledGridEventIds(demoIds: Set<String>) -> Set<String> {
        let accountEmails = Dictionary(
            calendars.map { ($0.id, $0.accountEmail) }, uniquingKeysWith: { first, _ in first })
        var ids = demoIds
        for event in loadedEvents {
            guard case .details(let details) = event.content,
                  details.attendees?.isEmpty == false,
                  AttendeeRsvp.hasUnsettledGuests(
                    organizerEmail: details.organizer?.email,
                    attendees: details.attendees,
                    calendarAccountEmail: accountEmails[event.calendarId.rawValue] ?? nil)
            else { continue }
            ids.insert(event.id.rawValue)
        }
        return ids
    }

    private func layoutMode() -> GridLayoutMode {
        viewStore.view == .day ? .day : .week
    }

    func rebuildPresentation() {
        if viewStore.view == .life {
            headerTitle = "Life"
            return
        }
        headerTitle = CalendarHeadingLabel.format(start: startOfView, end: endOfView, now: referenceNow)
        let hiddenIds = gridHiddenEventIdStrings
        let demoIds = demoEventIds
        let referenceNow = self.referenceNow
        var scenario = GridLayoutScenarioBuilder.build(
            layoutMode: layoutMode(),
            visibleDateKeys: visibleDateKeys(),
            referenceNow: referenceNow,
            calendars: visibleCalendars(),
            events: loadedEvents.filter { calendarVisibilityStore.isVisible($0.calendarId.rawValue) },
            hiddenEventIds: hiddenIds,
            demoEventIds: demoIds
        )
        scenario.draftOverlay = draftOverlayForPresentation()
        scenario.pinnedDayColumnCalendarIds = pinnedDayColumnCalendarIds()
        scenario.defaultTargetCalendarId = defaultTargetCalendarId()?.rawValue
        let hasSecondaryTimeZone = viewStore.timeTravelTimeZone != nil
        let eventJumpActive = eventJumpSelection.modeActive || eventJumpSelection.isActive
        let showDayJumpPrefixes =
            !isEventFormVisible && (focusStore.pageJumpHintsVisible || eventJumpActive)
        timeGridState = TimeGridState(
            layoutMode: layoutMode(),
            referenceNow: referenceNow,
            scenario: scenario,
            trackWidth: contentTrackWidth,
            focusedEventId: focusStore.focusedEventId?.rawValue,
            sidebarEditingEventId: sidebarEditingGridEventId(),
            eventJumpHints: eventJumpHintLabels,
            quickTimeSlotHints: quickTimeSlotHintLabels,
            focusedDayColumnCalendarId: focusedDayColumnCalendarId,
            pageJumpHintsVisible: focusStore.pageJumpHintsVisible,
            pageJumpDigitByCalendarId: pageJumpDigitByCalendarId(),
            showDayJumpPrefixes: showDayJumpPrefixes,
            dayJumpUseShiftPrefix: !eventJumpSelection.modeActive,
            eventJumpActiveDayKeys: eventJumpSelection.activeDayKeys,
            hasSecondaryTimeZone: hasSecondaryTimeZone,
            effectiveTimeZone: viewStore.effectiveTimeZone,
            timeTravelTimeZone: viewStore.timeTravelTimeZone
        )
        timeGridState.unsettledEventIds = unsettledGridEventIds(demoIds: demoIds)
        if eventJumpSelection.modeActive {
            quickTimeSlotHintLabels = buildQuickTimeSlotHints()
            timeGridState.quickTimeSlotHints = quickTimeSlotHintLabels
        }
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
            // Match web `useScroll`: jump to the now line on first demo layout.
            pendingScroll = .scrollToNowOrPulse
            didApplyDemoFixtureScroll = true
        }
        applyInitialUIFocusIfNeeded()
        gridFocusAccessibilityLabel = focusStore.focusedEventId.flatMap { focusedId in
            resolveGridFocusLabel(eventId: focusedId.rawValue, cards: snapshot.cards)
        }
        onGridFocusAccessibilityLabelChanged?(gridFocusAccessibilityLabel)
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
            if let title = UITestLaunchPolicy.presetEventFormTitle {
                updateDraftFromForm(title: title)
                onEventFormTitleAccessibilityProbeTitleSync?(title)
            }
            publishEventFormTitleAccessibilityProbe()
            if UITestLaunchPolicy.autoConfirmRecurrenceScopeOnSave {
                await saveDraftWithInvitationGate()
            }
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
        let resolved: [PageJumpTargets.Resolved]
        let accounts: [(key: String, label: String)] = calendarListGroups.compactMap { group in
            group.account.map { (key: group.id, label: $0) }
        }
        if viewStore.view == .day {
            let displayed = visibleCalendars().map { (id: $0.id, name: $0.name) }
            resolved = PageJumpTargets.buildDayPageJumpTargets(displayedCalendars: displayed, accounts: accounts)
        } else {
            resolved = PageJumpTargets.buildSidebarPageJumpTargets(accounts: accounts)
        }
        return resolved.map { target in
            PageJumpTarget(id: target.id, digit: target.digit, label: target.label)
        }
    }

    private func pageJumpDigitByCalendarId() -> [String: String] {
        PageJumpTargets.dayColumnJumpDigits(
            from: focusStore.pageJumpTargets.map { (id: $0.id, digit: $0.digit) }
        )
    }

    /// Web `ShiftHintOverlay`: W1, SU2, ... on every grid card, narrowed to
    /// the typed day prefix.
    func buildEventJumpHints() -> [EventJumpChipHint] {
        let layoutCards = currentGridCards()
        let frameByEventId = Dictionary(uniqueKeysWithValues: layoutCards.map { ($0.eventId, $0.frame) })
        let allDayByEventId = Dictionary(uniqueKeysWithValues: layoutCards.map { ($0.eventId, $0.kind == .allDay) })
        let assignments = DayJumpKeys.filter(dayJumpAssignments(), prefix: eventJumpSelection.dayJumpBuffer)
        return assignments.compactMap { assignment in
            guard let frame = frameByEventId[assignment.eventId] else { return nil }
            return EventJumpChipHint(
                eventId: assignment.eventId,
                label: assignment.hint,
                frame: frame,
                isAllDay: allDayByEventId[assignment.eventId] ?? false
            )
        }
    }

    func dayJumpAssignments() -> [DayJumpKeys.Assignment] {
        let eventsById = Dictionary(loadedEvents.map { ($0.id.rawValue, $0) }, uniquingKeysWith: { first, _ in first })
        var seen = Set<String>()
        let targets: [DayJumpKeys.Target] = currentGridCards().compactMap { card in
            guard seen.insert(card.eventId).inserted, let event = eventsById[card.eventId] else { return nil }
            let dayKey = eventJumpDayKey(for: event)
            guard let day = CompassDateParsing.calendarDateInEffectiveTimeZone(dayKey) else { return nil }
            return DayJumpKeys.Target(
                eventId: card.eventId,
                start: eventStart(event),
                isAllDay: card.kind == .allDay,
                dayKey: dayKey,
                weekday: EffectiveTimeZone.calendar.component(.weekday, from: day) - 1
            )
        }
        return DayJumpKeys.assign(targets)
    }

    public func visibleCalendars() -> [CompassCalendar] {
        calendars.filter { $0.isActive && calendarVisibilityStore.isVisible($0.id) }
    }

    /// Individually hidden event ids for grid layout and Up Next (same set as web hidden-events).
    var gridHiddenEventIdStrings: Set<String> {
        Set(hiddenEventsStore.hiddenEventIds.map(\.rawValue))
    }

    /// Timed/all-day candidates visible on the grid: visible calendar and not individually hidden.
    func eventsEligibleForUpNext(_ events: [Event]) -> [Event] {
        UpNextProjection.filterGridVisibleEvents(
            events,
            hiddenEventIds: gridHiddenEventIdStrings,
            isCalendarVisible: calendarVisibilityStore.isVisible)
    }

    /// Active calendars for the sidebar list, hidden ones included.
    public var sidebarCalendars: [CompassCalendar] {
        calendars.filter(\.isActive)
    }

    /// Web `useCalendarVisibility`: client-only, announced with a toast, and
    /// undoable with Cmd+Z.
    public func toggleCalendarVisibility(_ calendar: CompassCalendar) {
        let visible = !calendarVisibilityStore.isVisible(calendar.id)
        setCalendarVisibility(calendarId: calendar.id, label: calendar.name, visible: visible)
        undoStore.record(.calendarVisibility(calendarId: calendar.id, label: calendar.name, isVisible: visible))
    }

    func setCalendarVisibility(calendarId: String, label: String, visible: Bool) {
        calendarVisibilityStore.setVisible(calendarId, visible)
        rebuildPresentation()
        statusToastStore.show(
            id: "calendar-visibility",
            message: visible ? "Showing \(label) calendar" : "Hidden \(label) calendar"
        )
    }

    public var writableEventCalendars: [CompassCalendar] {
        DefaultCalendarResolver.writableCalendars(
            calendars, hasConnectedAccount: !syncConnectionsStore.connections.isEmpty)
    }

    func defaultTargetCalendarId() -> CalendarId? {
        DefaultCalendarResolver.resolvedDefault(
            calendars: calendars,
            storedId: settingsStore.defaultCalendarId,
            hasConnectedAccount: !syncConnectionsStore.connections.isEmpty
        ).map { CalendarId(rawValue: $0.id) }
    }

    private func scheduleRefreshVisibleRange() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(50))
            guard !Task.isCancelled else { return }
            await self?.refreshVisibleRange()
        }
    }

    func refreshVisibleRange() async {
        let revision = sessionRevision
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
            guard revision == sessionRevision, isSignedIn || eventsStore.source == .local else { return }
            loadedEvents = try eventsStore.fetchAllEvents()
            rebuildPresentation()
            await refreshSideband()
        } catch {
            Self.log.error("refresh visible range failed: \(String(describing: error), privacy: .public)")
        }
    }

    private func queryRange() -> (startDate: String, endDate: String) {
        if viewStore.view == .day {
            return CalendarWindowMath.dayEventQueryRange(date: startOfView)
        }
        return CalendarWindowMath.weekEventQueryRange(anchor: startOfView)
    }

    private func reloadCalendars() async {
        let revision = sessionRevision
        if eventsStore.source == .local, !isSignedIn {
            await bootstrapAnonymousCalendarsIfNeeded()
            return
        }
        guard isSignedIn else { return }
        if (try? AccountCacheIdentity.matches(userId: authStore.userId,
            repository: environment.userMetadataRepository)) == true,
           let cached = try? calendarRepository.fetchAll() {
            calendars = cached
            rebuildPresentation()
        }
        do {
            let remote = try await environment.apiClient.calendars.list()
            guard revision == sessionRevision, isSignedIn else { return }
            var merged = remote
            if SystemCalendarConnectionStore.isConnected {
                let cached = try calendarRepository.fetchAll()
                let systemCalendars = cached.filter {
                    $0.id.hasPrefix(SystemCalendarMapper.calendarIdPrefix)
                }
                merged.append(contentsOf: systemCalendars)
            }
            var localIds = try calendarIdsOwnedByLocalEvents()
            if let localCalendarId { localIds.insert(localCalendarId) }
            let previousIds = Set(try calendarRepository.fetchAll().map(\.id))
            let retainedIds = localIds.union(merged.map(\.id))
            try calendarRepository.replaceRemote(calendars: merged, preservingIds: localIds)
            try eventsStore.removeCachedEvents(forCalendarIds: previousIds.subtracting(retainedIds))
            calendars = try calendarRepository.fetchAll()
            loadedEvents = try eventsStore.fetchAllEvents()
            rebuildPresentation()
        } catch {
            Self.log.error("reload calendars failed: \(String(describing: error), privacy: .public)")
        }
    }

    private func bootstrapAnonymousCalendarsIfNeeded() async {
        do {
            let calendar: CompassCalendar
            if let demoPresentation {
                calendar = demoPresentation.calendarListItem()
            } else {
                let sentinel = try LocalCalendarSentinel.calendarId(
                    repository: environment.userMetadataRepository)
                calendar = LocalCalendarSentinel.synthesizeCalendar(id: sentinel)
            }
            try calendarRepository.upsert(calendars: [calendar])
            localCalendarId = calendar.id
            // Local records prove which cached calendars belong to this device.
            // Other cached calendars require the signed-in session that loaded them.
            var localIds = try calendarIdsOwnedByLocalEvents()
            localIds.insert(calendar.id)
            calendars = try calendarRepository.fetchAll().filter { localIds.contains($0.id) }
            rebuildPresentation()
        } catch {
            Self.log.error("bootstrap local calendars failed: \(String(describing: error), privacy: .public)")
        }
    }

    private func calendarIdsOwnedByLocalEvents() throws -> Set<String> {
        Set(try environment.localEventRepository.fetchAll().map { $0.event.calendarId.rawValue })
    }

    private func configureAnalyticsFromConfig() async {
        let override = UserDefaults.standard.string(forKey: "COMPASS_APP_URL")
        let host = override.flatMap { URL(string: $0)?.host }
            ?? AppHostPreference.load().url.host
        await analyticsIdentity.setPostHogEnvironment(hostname: host)
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
                        self?.streamTroubleSince = nil
                        try? self?.eventsStore.handleStreamReopen()
                        await self?.refreshAfterStreamChange()
                    }
                },
                onError: { [weak self] in
                    Task { @MainActor in
                        guard let self, self.streamTroubleSince == nil else { return }
                        self.streamTroubleSince = Date()
                    }
                }
            )
        }
    }
}
