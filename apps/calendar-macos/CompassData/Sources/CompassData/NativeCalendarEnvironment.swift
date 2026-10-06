import CompassKit
import Foundation

public struct NativeCalendarEnvironment: Sendable {
    public let apiClient: CompassAPIClient
    public let database: AppDatabase
    public let eventsStore: EventsStore
    public let hiddenEventsStore: HiddenEventsStore
    public let calendarRepository: CalendarRepository
    public let localEventRepository: LocalEventRepository
    public let userMetadataRepository: UserMetadataRepository
    public let configStore: ConfigStore
    public let authStore: AuthStore
    public let billingStore: BillingStore
    public let oauthService: OAuthAuthorizationService
    public let syncConnectionsStore: SyncConnectionsStore
    public let levelsStore: LevelsStore
    public let onboardingStore: OnboardingStore
    public let blockPartyStore: BlockPartyStore
    public let shortcutRegistry: ShortcutRegistry
    public let analyticsIdentity: AnalyticsIdentityCoordinator

    @MainActor
    public init(
        appURL: URL = AppHostPreference.productionURL,
        inMemoryDatabase: Bool = false,
        sessionStore: (any SessionStore)? = nil,
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
            urlSession: .shared
        )
        let remembered = try AuthRememberedState.hasUserEverAuthenticated(repository: userMetadataRepository)
        let source = EventRepositorySelection.source(
            sessionExists: false,
            hasUserEverAuthenticated: remembered
        )

        self.apiClient = apiClient
        self.database = database
        self.localEventRepository = localEventRepository
        self.userMetadataRepository = userMetadataRepository
        self.calendarRepository = CalendarRepository(database: database)
        eventsStore = EventsStore(
            repository: eventRepository,
            localEvents: localEventRepository,
            rangeCache: rangeCache,
            eventsAPI: EventsAPI(client: apiClient),
            source: source
        )
        hiddenEventsStore = HiddenEventsStore(
            repository: HiddenEventRepository(database: database),
            remoteClient: UserAPI(client: apiClient)
        )
        configStore = ConfigStore(apiClient: apiClient)
        oauthService = OAuthAuthorizationService(
            apiClient: apiClient,
            appURL: appURL,
            webAuthPresenter: nil)
        syncConnectionsStore = SyncConnectionsStore(
            oauthService: oauthService,
            userAPI: UserAPI(client: apiClient),
            configStore: configStore)
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
        shortcutRegistry = try ShortcutRegistry()
        levelsStore = LevelsStore(registry: shortcutRegistry, analytics: analytics)
        onboardingStore = OnboardingStore(analytics: analytics)
        blockPartyStore = BlockPartyStore(analytics: analytics)
        self.analyticsIdentity = analyticsIdentity
    }
}
