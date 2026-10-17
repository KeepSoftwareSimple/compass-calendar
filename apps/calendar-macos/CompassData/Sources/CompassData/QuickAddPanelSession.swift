import CompassKit
import Foundation

/// A global panel must not borrow or replace the main editor's draft.
struct QuickAddPanelSession: Sendable {
    let id: EventId
    let targetDay: Date
    let sessionRevision: Int
    var query = ""
    var isSaving = false
}
