@testable import CompassData
import CompassKit
import XCTest

final class LocalEventSyncTests: XCTestCase {
    func testSyncSkipsDemoEventsAndClearsStorage() async throws {
        let database = try AppDatabase.inMemory()
        let localEvents = LocalEventRepository(database: database)
        let demoFixture = try DemoSeedFixture.load()
        let userEvent = try StoreSampleEvents.timedEvent(id: "user-local-event", title: "User draft")
        try localEvents.put(LocalEventRecord(id: userEvent.id, event: userEvent, isDemo: false))
        if let demoRow = demoFixture.events.first(where: \.isDemo) {
            try localEvents.put(LocalEventRecord(
                id: EventId(rawValue: demoRow.id),
                event: demoRow.event,
                isDemo: true))
        }

        var createCount = 0
        let mockAPI = MockEventsAPI()
        mockAPI.createHandler = { input in
            createCount += 1
            let event = try StoreSampleEvents.timedEvent(
                id: input.id?.rawValue ?? "created",
                title: input.content.title)
            return try StoreSampleEvents.response(from: event)
        }
        let sync = LocalEventSync(
            localEvents: localEvents,
            eventsAPI: mockAPI,
            listCalendars: {
                [demoFixture.calendarListItem()]
            })

        let synced = try await sync.syncLocalEventsToCloud()
        XCTAssertEqual(synced, 1)
        XCTAssertTrue(try localEvents.fetchAll().isEmpty)
        XCTAssertEqual(createCount, 1)
    }

    func testSyncPayloadDefaultsMissingLocation() throws {
        let event = try StoreSampleEvents.timedEvent(id: "evt-1", title: "Title")
        let record = LocalEventRecord(id: event.id, event: event, isDemo: false)
        let input = try LocalEventSync.toCreateInput(
            record: record,
            targetCalendarId: "507f1f77bcf86cd799439011")
        XCTAssertEqual(input.content.location, "")
    }
}
