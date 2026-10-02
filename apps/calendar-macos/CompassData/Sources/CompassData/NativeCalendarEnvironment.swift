import CompassKit
import Foundation

public struct NativeCalendarEnvironment: Sendable {
    public let apiClient: CompassAPIClient
    public let database: AppDatabase
    public let eventsStore: EventsStore
    public let hiddenEventsStore: HiddenEventsStore
    public let calendarRepository: CalendarRepository
    public let usesFixtureTransport: Bool

    @MainActor
    public init(
        appURL: URL = AppHostPreference.productionURL,
        fixture: DemoSeedFixture? = nil
    ) throws {
        let sessionStore: any SessionStore = MemorySessionStore(
            tokens: fixture == nil
                ? nil
                : SessionTokens(
                    accessToken: "fixture-access",
                    refreshToken: "fixture-refresh",
                    frontToken: "fixture-front"
                )
        )
        let urlSession: URLSession
        if let fixture {
            urlSession = FixtureTransport.install(.demo(fixture))
            usesFixtureTransport = true
        } else {
            urlSession = .shared
            usesFixtureTransport = false
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
    }
}
