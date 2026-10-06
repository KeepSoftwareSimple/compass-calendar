import Foundation

/// Maps a grid draft to create/replace payloads, including invitation intent.
public enum EventFormSavePayload {
    public static func invitationPayload(
        for draft: GridEventDraftSnapshot,
        guestsChanged: Bool,
        invitation: InvitationEnum?
    ) -> InvitationEnum? {
        guard guestsChanged else { return nil }
        return invitation
    }
}

/// Test-friendly snapshot of draft fields that affect save payloads.
public struct GridEventDraftSnapshot: Sendable, Equatable {
    public var kind: GridEventDraftSnapshotKind
    public var attendees: [DraftAttendeeInput]?
    public var createConference: Bool

    public init(
        kind: GridEventDraftSnapshotKind,
        attendees: [DraftAttendeeInput]? = nil,
        createConference: Bool = false
    ) {
        self.kind = kind
        self.attendees = attendees
        self.createConference = createConference
    }
}

public enum GridEventDraftSnapshotKind: Sendable, Equatable {
    case create
    case edit(sourceGuestEmails: [String])
}

extension GridEventDraftSnapshot {
    public static func guestsChanged(
        draft: GridEventDraftSnapshot
    ) -> Bool {
        guard let edited = draft.attendees else { return false }
        switch draft.kind {
        case .create:
            return !edited.isEmpty
        case .edit(let source):
            let editedSet = Set(edited.map { $0.email.lowercased() })
            let sourceSet = Set(source.map { $0.lowercased() })
            return editedSet != sourceSet
        }
    }
}
