import CompassKit
import CompassData
import XCTest

final class QueryInvalidatorTests: XCTestCase {
    func testEveryServerMessageCaseIsMapped() {
        let samples: [ServerMessage] = [
            .calendarsChanged(
                ServerMessage_CalendarsChangedPayload(calendarIds: ["c1"], type: "calendarsChanged")
            ),
            .eventsChanged(
                ServerMessage_EventsChangedPayload(
                    calendarId: CalendarId(rawValue: "c1"),
                    eventIds: ["e1"],
                    reason: .created,
                    type: "eventsChanged"
                )
            ),
            .importCompleted(
                ServerMessage_ImportCompletedPayload(
                    calendarsCount: 1,
                    eventsCount: 2,
                    operation: .incremental,
                    type: "importCompleted"
                )
            ),
            .syncStatusChanged(
                ServerMessage_SyncStatusChangedPayload(
                    sync: .syncing(ServerMessageSyncStatusChangedSync_SyncingPayload(status: "syncing")),
                    type: "syncStatusChanged"
                )
            ),
            .syncStatusChanged(
                ServerMessage_SyncStatusChangedPayload(
                    sync: .healthy(ServerMessageSyncStatusChangedSync_HealthyPayload(status: "healthy")),
                    type: "syncStatusChanged"
                )
            ),
            .syncStatusChanged(
                ServerMessage_SyncStatusChangedPayload(
                    sync: .attention(
                        ServerMessageSyncStatusChangedSync_AttentionPayload(
                            code: .cONNECTION_REVOKED,
                            connectionId: nil,
                            retryable: false,
                            status: "attention"
                        )
                    ),
                    type: "syncStatusChanged"
                )
            ),
            .syncStatusChanged(
                ServerMessage_SyncStatusChangedPayload(
                    sync: .attention(
                        ServerMessageSyncStatusChangedSync_AttentionPayload(
                            code: .pROVIDER_FAILURE,
                            connectionId: nil,
                            retryable: true,
                            status: "attention"
                        )
                    ),
                    type: "syncStatusChanged"
                )
            ),
            .userMetadataChanged(
                ServerMessage_UserMetadataChangedPayload(metadata: [:], type: "userMetadataChanged")
            ),
        ]

        for message in samples {
            _ = QueryInvalidator.invalidations(for: message)
        }
    }

    func testInvalidationTargetsMatchWebHooks() {
        XCTAssertEqual(
            QueryInvalidator.invalidations(for: .eventsChanged(
                ServerMessage_EventsChangedPayload(
                    calendarId: CalendarId(rawValue: "c1"),
                    eventIds: [],
                    reason: .updated,
                    type: "eventsChanged"
                )
            )),
            [.events]
        )

        XCTAssertEqual(
            QueryInvalidator.streamReopenInvalidations(),
            Set(QueryInvalidationTarget.allCases)
        )
    }
}
