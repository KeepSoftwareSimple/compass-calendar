import CryptoKit
import Foundation

/// Mirrors `packages/core/src/util/series-split.ts`.
public enum SeriesSplit {
    public static func remainderMasterId(seriesId: EventId, splitAt: String) -> EventId {
        let digest = SHA256.hash(data: Data("\(seriesId.rawValue):\(splitAt)".utf8))
        let hex = digest.map { String(format: "%02x", $0) }.joined()
        return EventId(rawValue: String(hex.prefix(24)))
    }
}
