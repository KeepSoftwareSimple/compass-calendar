import Foundation

/// Start or end schedule edge for grid keyboard focus (web `EventEdge`).
public enum EventEdge: String, Sendable, Hashable, Codable {
    case startDate
    case endDate
}
