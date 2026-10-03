import Foundation

public enum TimeGridScrollRequest: Equatable, Sendable {
    case pageUp
    case pageDown
    case hourUp
    case hourDown
    case revealDocumentY(Double)
}
