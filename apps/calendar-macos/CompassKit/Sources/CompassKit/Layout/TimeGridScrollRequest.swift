import Foundation

public enum TimeGridScrollRequest: Equatable, Sendable {
    case pageUp
    case pageDown
    case hourUp
    case hourDown
    case revealDocumentY(Double)
    /// Scroll to the now line when needed; pulse today + now when already there.
    case scrollToNowOrPulse
}
