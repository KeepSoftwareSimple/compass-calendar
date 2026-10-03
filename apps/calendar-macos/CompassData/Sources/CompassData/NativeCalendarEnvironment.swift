import CompassKit
import Foundation

public struct NativeCalendarEnvironment: Sendable {
    public let apiClient: CompassAPIClient
    public let database: AppDatabase
    public let eventsStore: EventsStore
    public let hiddenEventsStore: HiddenEventsStore
    public let calendarRepository: CalendarRepository
    public let configStore: ConfigStore
    public let authStore: AuthStore
    public let levelsStore: LevelsStore
    public let shortcutRegistry: ShortcutRegistry
    public let analyticsIdentity: AnalyticsIdentityCoordinator

    @MainActor
    public init(
        appURL: URL = AppHostPreference.productionURL,
        fixture: DemoSeedFixture? = nil,
        sessionStore: (any SessionStore)? = nil,
        analytics: ProductAnalyticsClient = NoOpProductAnalyticsClient(),
        analyticsIdentity: AnalyticsIdentityCoordinator = NoOpAnalyticsIdentityCoordinator()
    ) throws {
        let sessionStore: any SessionStore = sessionStore ?? {
            if let fixture {
                return MemorySessionStore(
                    tokens: SessionTokens(
                        accessToken: "fixture-access",
                        refreshToken: "fixture-refresh",
                        frontToken: "fixture-front"
                    )
                )
            }
            return KeychainSessionStore()
        }()
        let urlSession: URLSession
        if let fixture {
            urlSession = FixtureTransport.install(.demo(fixture))
        } else {
            urlSession = .shared
        }
        let database = try AppDatabase.inMemory()
        let eventRepository = EventRepository(database: database)
        let rangeCache = RangeCache(database: database)
        let apiClient = CompassAPIClient(
            appURL: appURL,
            sessionStore: sessionStore,
            urlSession: urlSession
        )
        self.apiClient = apiClient
        self.database = database
        self.calendarRepository = CalendarRepository(database: database)
        eventsStore = EventsStore(
            repository: eventRepository,
            rangeCache: rangeCache,
            eventsAPI: EventsAPI(client: apiClient)
        )
        hiddenEventsStore = HiddenEventsStore(
            repository: HiddenEventRepository(database: database),
            remoteClient: UserAPI(client: apiClient)
        )
        configStore = ConfigStore(apiClient: apiClient)
        authStore = AuthStore(
            apiClient: apiClient,
            configStore: configStore,
            analyticsIdentity: analyticsIdentity
        )
        shortcutRegistry = try ShortcutRegistry()
        levelsStore = LevelsStore(registry: shortcutRegistry, analytics: analytics)
        self.analyticsIdentity = analyticsIdentity
    }
}
