import CompassData
import CompassKit
import XCTest

final class FixtureTransportTests: XCTestCase {
    func testDemoFixtureListsEvents() async throws {
        let fixture = try DemoSeedFixture.load()
        EffectiveTimeZone.identifier = fixture.timeZone
        let session = FixtureTransport.install(.demo(fixture))
        defer { FixtureTransport.clear() }

        let client = CompassAPIClient(
            appURL: URL(string: "https://compasscalendar.com")!,
            sessionStore: MemorySessionStore(
                tokens: SessionTokens(
                    accessToken: "a",
                    refreshToken: "r",
                    frontToken: "f"
                )
            ),
            urlSession: session
        )
        let range = CalendarWindowMath.weekEventQueryRange(anchor: fixture.referenceNow)
        let events = try await client.events.list(
            EventListQuery(kind: "timed", start: range.startDate, end: range.endDate)
        )
        XCTAssertFalse(events.isEmpty)
    }
}
