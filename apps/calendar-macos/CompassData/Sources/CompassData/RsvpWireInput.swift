import CompassKit
import Foundation

/// Backend RSVP scope uses `single` / `all`, not replace-event `this` / `all`.
struct RsvpWireInput: Encodable, Sendable {
    let responseStatus: ResponseStatusEnum
    let scope: String

    init(responseStatus: ResponseStatusEnum, scope: String) {
        self.responseStatus = responseStatus
        self.scope = scope
    }
}

enum RsvpScopeWire {
    static func forEvent(recurrence: EventRecurrence) -> String {
        switch recurrence {
        case .occurrence:
            return "single"
        case .series:
            return "all"
        case .single:
            return "single"
        }
    }
}
