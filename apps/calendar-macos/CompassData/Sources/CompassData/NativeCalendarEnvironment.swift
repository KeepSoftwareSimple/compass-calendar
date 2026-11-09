import CompassKit
import Foundation

public struct NativeCalendarEnvironment: Sendable {
    public let apiClient: CompassAPIClient
    public let database: AppDatabase
    public let eventsStore: EventsStore
    public let hiddenEventsStore: HiddenEventsStore
    public let clipboardStore: ClipboardStore
    public let pastePreviewStore: PastePreviewStore
    public let undoStore: UndoStore
    public let calendarRepository: CalendarRepository
    public let localEventRepository: LocalEventRepository
    public let userMetadataRepository: UserMetadataRepository
    public let configStore: ConfigStore
    public let authStore: AuthStore
    public let billingStore: BillingStore
    public let bookingStore: BookingStore
    public let oauthService: OAuthAuthorizationService
    public let syncConnectionsStore: SyncConnectionsStore
    public let levelsStore: LevelsStore
    public let onboardingStore: OnboardingStore
    public let blockPartyStore: BlockPartyStore
    public let shortcutRegistry: ShortcutRegistry
    public let analyticsIdentity: AnalyticsIdentityCoordinator
    public let productAnalytics: ProductAnalyticsClient

    @MainActor
    public init(
        appURL: URL = AppHostPreference.productionURL,
        inMemoryDatabase: Bool = false,
        sessionStore: (any SessionStore)? = nil,
        eventsAPI: EventsAPIProtocol? = nil,
        repositorySource: EventRepositorySource? = nil,
        urlSession: URLSession = .shared,
        analytics: ProductAnalyticsClient = NoOpProductAnalyticsClient(),
        analyticsIdentity: AnalyticsIdentityCoordinator = NoOpAnalyticsIdentityCoordinator(),
        sessionPresenter: any HostedBillingSessionPresenting = UnavailableHostedBillingSessionPresenter()
    ) throws {
        let sessionStore: any SessionStore = sessionStore ?? KeychainSessionStore()
        let database = try inMemoryDatabase ? AppDatabase.inMemory() : AppDatabase.openPersistent()
        let eventRepository = EventRepository(database: database)
        let localEventRepository = LocalEventRepository(database: database)
        let userMetadataRepository = UserMetadataRepository(database: database)
        let rangeCache = RangeCache(database: database)
        let apiClient = CompassAPIClient(
            appURL: appURL,
            sessionStore: sessionStore,
            urlSession: urlSession
        )
        let remembered = try AuthRememberedState.hasUserEverAuthenticated(repository: userMetadataRepository)
        let source = repositorySource ?? EventRepositorySelection.source(
            sessionExists: false,
            hasUserEverAuthenticated: remembered
        )
        let resolvedEventsAPI = eventsAPI ?? EventsAPI(client: apiClient)

        self.apiClient = apiClient
        self.database = database
        self.localEventRepository = localEventRepository
        self.userMetadataRepository = userMetadataRepository
        self.calendarRepository = CalendarRepository(database: database)
        eventsStore = EventsStore(
            repository: eventRepository,
            localEvents: localEventRepository,
            rangeCache: rangeCache,
            eventsAPI: resolvedEventsAPI,
            source: source
        )
        let hiddenSource: HiddenEventRepositorySource = source == .local ? .local : .remote
        hiddenEventsStore = HiddenEventsStore(
            repository: HiddenEventRepository(database: database),
            remoteClient: UserAPI(client: apiClient),
            source: hiddenSource
        )
        clipboardStore = ClipboardStore()
        pastePreviewStore = PastePreviewStore()
        undoStore = UndoStore()
        configStore = ConfigStore(apiClient: apiClient)
        oauthService = OAuthAuthorizationService(
            apiClient: apiClient,
            appURL: appURL,
            webAuthPresenter: nil)
        let userAPI = UserAPI(client: apiClient)
        syncConnectionsStore = SyncConnectionsStore(
            oauthService: oauthService,
            userAPI: userAPI,
            configStore: configStore,
            calendarRepository: calendarRepository)
        authStore = AuthStore(
            apiClient: apiClient,
            configStore: configStore,
            oauthService: oauthService,
            analyticsIdentity: analyticsIdentity,
            usesFixtureTransport: inMemoryDatabase,
            userMetadataRepository: userMetadataRepository,
            localEventSync: LocalEventSync(
                localEvents: localEventRepository,
                eventsAPI: EventsAPI(client: apiClient),
                listCalendars: {
                    let remote = try await apiClient.calendars.list()
                    return remote
                }
            ),
            eventsStore: eventsStore
        )
        billingStore = BillingStore(
            apiClient: apiClient,
            configStore: configStore,
            analytics: analytics,
            sessionPresenter: sessionPresenter)
        bookingStore = BookingStore(apiClient: apiClient, analytics: analytics)
        shortcutRegistry = try ShortcutRegistry()
        levelsStore = LevelsStore(registry: shortcutRegistry, analytics: analytics)
        levelsStore.onHintFirstUsedAccountSync = { keys in
            Task {
                guard (try? await apiClient.currentSession()) != nil else { return }
                _ = try? await userAPI.updateMetadata(
                    UserMetadata(shortcuts: UserMetadataShortcuts(hintFirstUsed: keys)))
            }
        }
        onboardingStore = OnboardingStore(analytics: analytics)
        blockPartyStore = BlockPartyStore(analytics: analytics)
        productAnalytics = analytics
        self.analyticsIdentity = analyticsIdentity
    }
}
