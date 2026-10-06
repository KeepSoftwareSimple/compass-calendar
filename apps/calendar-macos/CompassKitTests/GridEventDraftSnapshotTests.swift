import CompassKit
import XCTest

final class GridEventDraftSnapshotTests: XCTestCase {
    func testGuestsChangedForCreateDraftWithGuests() {
        let draft = GridEventDraftSnapshot(
            kind: .create,
            attendees: [DraftAttendeeInput(email: "ada@example.com", displayName: nil)]
        )
        XCTAssertTrue(GridEventDraftSnapshot.guestsChanged(draft: draft))
    }

    func testInvitationPayloadOnlyWhenGuestsChanged() {
        let changed = GridEventDraftSnapshot(
            kind: .edit(sourceGuestEmails: ["ada@example.com"]),
            attendees: [DraftAttendeeInput(email: "bob@example.com", displayName: nil)]
        )
        XCTAssertEqual(
            EventFormSavePayload.invitationPayload(for: changed, guestsChanged: true, invitation: .all),
            .all
        )
        XCTAssertNil(
            EventFormSavePayload.invitationPayload(for: changed, guestsChanged: false, invitation: .all)
        )
    }
}
