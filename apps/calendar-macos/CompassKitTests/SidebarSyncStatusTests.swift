import CompassKit
import XCTest

final class SidebarSyncStatusTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func connection(
        state: String,
        connectionState: UserMetadataConnectionsConnectionStateEnum = .hEALTHY,
        stateReason: String? = nil,
        lastHealthyAt: String? = "2027-01-01T00:00:00Z",
        lastSyncedAt: String? = nil
    ) -> UserMetadataConnections {
        UserMetadataConnections(
            accountEmail: "a@example.com",
            canSuggestContacts: true,
            connectionState: connectionState,
            id: "c-\(state)",
            lastHealthyAt: lastHealthyAt,
            lastSyncedAt: lastSyncedAt,
            state: state,
            stateReason: stateReason)
    }

    private func resolve(
        _ connections: [UserMetadataConnections],
        isSaving: Bool = false,
        isStreamDegraded: Bool = false
    ) -> SidebarSyncStatus? {
        SidebarSyncStatus.resolve(
            connections: connections, isSaving: isSaving, isStreamDegraded: isStreamDegraded, now: now)
    }

    func testHealthyAccountsShowNothing() {
        XCTAssertNil(resolve([connection(state: "healthy")]))
        XCTAssertNil(resolve([]))
    }

    func testSavingWinsOverEverything() {
        XCTAssertEqual(
            resolve([connection(state: "delayed")], isSaving: true, isStreamDegraded: true),
            .saving)
    }

    func testNewAccountShowsAdding() {
        XCTAssertEqual(
            resolve([connection(state: "importing", lastHealthyAt: nil)])?.text,
            "Adding your calendar…")
        XCTAssertNil(resolve([connection(state: "importing")]))
    }

    func testCatchingUpStaysQuietForTwoMinutes() {
        let recent = ISO8601DateFormatter().string(from: now.addingTimeInterval(-60))
        let stale = ISO8601DateFormatter().string(from: now.addingTimeInterval(-180))
        XCTAssertNil(resolve([connection(state: "catchingUp", lastSyncedAt: recent)]))
        XCTAssertEqual(
            resolve([connection(state: "catchingUp", lastSyncedAt: stale)])?.text,
            "Syncing in the background…")
    }

    func testDelayedCopyFollowsReason() {
        XCTAssertEqual(resolve([connection(state: "delayed")])?.text, "Google updates are delayed")
        XCTAssertEqual(
            resolve([connection(state: "delayed", stateReason: "providerErrors")])?.text,
            "Google delayed: Google is slow")
        XCTAssertEqual(resolve([connection(state: "delayed")])?.variant, .warning)
    }

    func testReconnectAccountsAreLeftToTheBanner() {
        XCTAssertNil(resolve([connection(state: "delayed", connectionState: .rECONNECT_REQUIRED)]))
        XCTAssertNil(resolve([connection(state: "disconnected")]))
    }

    func testMostUrgentAccountWins() {
        let status = resolve([
            connection(state: "importing", connectionState: .iMPORTING, lastHealthyAt: nil),
            connection(state: "delayed", connectionState: .aTTENTION),
        ])
        XCTAssertEqual(status?.text, "Google updates are delayed")
    }

    func testDegradedStreamShowsOnlyWhenSyncIsQuiet() {
        XCTAssertEqual(resolve([], isStreamDegraded: true), .streamDegraded)
        XCTAssertEqual(
            resolve([connection(state: "delayed")], isStreamDegraded: true)?.text,
            "Google updates are delayed")
    }
}
