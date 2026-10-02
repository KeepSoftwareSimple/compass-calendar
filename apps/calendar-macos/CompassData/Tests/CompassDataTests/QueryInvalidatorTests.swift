import CompassKit
import CompassData
import XCTest

final class QueryInvalidatorTests: XCTestCase {
    func testEveryServerMessageCaseIsMapped() throws {
        let jsonSamples = [
            """
            {"type":"calendarsChanged","calendarIds":["c1"]}
            """,
            """
            {"type":"eventsChanged","calendarId":"c1","eventIds":["e1"],"reason":"created"}
            """,
            """
            {"type":"importCompleted","operation":"incremental","eventsCount":2,"calendarsCount":1}
            """,
            """
            {"type":"syncStatusChanged","sync":{"status":"syncing"}}
            """,
            """
            {"type":"syncStatusChanged","sync":{"status":"healthy"}}
            """,
            """
            {"type":"syncStatusChanged","sync":{"status":"attention","code":"CONNECTION_REVOKED","retryable":false}}
            """,
            """
            {"type":"syncStatusChanged","sync":{"status":"attention","code":"PROVIDER_FAILURE","retryable":true}}
            """,
            """
            {"type":"userMetadataChanged","metadata":{}}
            """,
        ]

        for json in jsonSamples {
            let message = try ContractTestDecoding.decodeJSON(json, as: ServerMessage.self)
            _ = QueryInvalidator.invalidations(for: message)
        }
    }

    func testInvalidationTargetsMatchWebHooks() throws {
        let eventsChanged = try ContractTestDecoding.decodeJSON(
            """
            {"type":"eventsChanged","calendarId":"c1","eventIds":[],"reason":"updated"}
            """,
            as: ServerMessage.self
        )
        XCTAssertEqual(QueryInvalidator.invalidations(for: eventsChanged), [.events])

        XCTAssertEqual(
            QueryInvalidator.streamReopenInvalidations(),
            Set(QueryInvalidationTarget.allCases)
        )
    }
}
