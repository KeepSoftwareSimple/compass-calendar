import CompassKit
import Foundation

/// Query cache targets invalidated by SSE, mirroring the web hooks wired through
/// `apps/calendar-web/src/sse/client/sse.client.ts` (`onServerMessage` /
/// `onStreamReopen`) and their consumers (`useEventSSE`, `useSyncSSE`,
/// `useSSEConnection`).
public enum QueryInvalidationTarget: Hashable, Sendable, CaseIterable {
    case events
    case calendars
    case userMetadata
}

public enum QueryInvalidator {
    public static func invalidations(for message: ServerMessage) -> Set<QueryInvalidationTarget> {
        switch message {
        case .eventsChanged:
            return [.events]
        case .calendarsChanged:
            // useEventSSE invalidates calendars; useSyncSSE refreshes metadata.
            return [.calendars, .userMetadata]
        case .importCompleted:
            // useSyncSSE importCompleted: metadata refresh + event invalidation.
            return [.events, .userMetadata]
        case .syncStatusChanged(let payload):
            return invalidations(for: payload.sync)
        case .userMetadataChanged:
            return [.userMetadata]
        }
    }

    public static func invalidations(
        for sync: ServerMessageSyncStatusChangedSync
    ) -> Set<QueryInvalidationTarget> {
        switch sync {
        case .syncing:
            return []
        case .healthy:
            return [.userMetadata]
        case .attention(let payload):
            if payload.code == .cONNECTION_REVOKED {
                return []
            }
            return [.userMetadata]
        }
    }

    /// `useSSEConnection` / stream `open` handler: events, calendars, metadata.
    public static func streamReopenInvalidations() -> Set<QueryInvalidationTarget> {
        [.events, .calendars, .userMetadata]
    }

    /// Clears cached event ranges when events are invalidated.
    public static func apply(_ targets: Set<QueryInvalidationTarget>, rangeCache: RangeCache) throws {
        if targets.contains(.events) {
            try rangeCache.clear(sourcePrefix: EventQueryScope.day.rawValue)
            try rangeCache.clear(sourcePrefix: EventQueryScope.week.rawValue)
        }
    }
}
