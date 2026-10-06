import CompassKit
import Foundation

/// Mirrors web `NewEventRecurrenceDraft` / `EditEventRecurrenceDraft` on grid drafts.
public enum GridEventRecurrenceDraft: Sendable, Equatable {
    case single
    case series(rules: [String])
    case preserve
}
