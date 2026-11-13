import Foundation

/// One line at the bottom of the sidebar, ported from the web's
/// `SidebarStatusBar` and `getAggregateSidebarSyncStatus`. A healthy app shows
/// nothing; accounts that need reconnecting are left to the reconnect banner.
public struct SidebarSyncStatus: Equatable, Sendable {
    public enum Variant: Sendable {
        case syncing
        case warning
    }

    public let variant: Variant
    public let text: String

    public init(variant: Variant, text: String) {
        self.variant = variant
        self.text = text
    }

    /// Web `CATCHING_UP_NOTICE_AFTER_MS`.
    static let catchingUpNoticeAfter: TimeInterval = 2 * 60

    public static let saving = SidebarSyncStatus(variant: .syncing, text: "Saving changes…")
    public static let streamDegraded = SidebarSyncStatus(
        variant: .warning, text: "Reconnecting live updates…")

    /// Saving wins, then the most urgent account, then a stalled live stream.
    public static func resolve(
        connections: [UserMetadataConnections],
        isSaving: Bool,
        isStreamDegraded: Bool,
        now: Date
    ) -> SidebarSyncStatus? {
        if isSaving { return .saving }
        if let status = aggregate(connections: connections, now: now) { return status }
        return isStreamDegraded ? .streamDegraded : nil
    }

    static func aggregate(connections: [UserMetadataConnections], now: Date) -> SidebarSyncStatus? {
        let entries = connections
            .filter { !needsReconnect($0) }
            .compactMap { connection in status(for: connection, now: now).map { (connection, $0) } }
        // Web `pickAggregateSidebarStatus`: the highest-precedence account wins.
        return entries.min { rank($0.0) < rank($1.0) }?.1
    }

    static func status(for connection: UserMetadataConnections, now: Date) -> SidebarSyncStatus? {
        switch connection.state {
        case "catchingUp":
            guard connection.lastHealthyAt != nil else { return adding }
            guard let synced = connection.lastSyncedAt.flatMap(CompassDateParsing.parseInEffectiveTimeZone),
                  now.timeIntervalSince(synced) >= catchingUpNoticeAfter
            else { return nil }
            return SidebarSyncStatus(variant: .syncing, text: "Syncing in the background…")
        case "delayed":
            let (product, vendor) = CalendarConnectionBanner.delayedNames(connection.provider)
            let text: String
            if connection.stateReason == "providerErrors" {
                text = "\(product) delayed: \(vendor) is slow"
            } else {
                text = "\(product) updates are delayed"
            }
            return SidebarSyncStatus(variant: .warning, text: text)
        case "connecting", "importing":
            return connection.lastHealthyAt == nil ? adding : nil
        default:
            return nil
        }
    }

    private static let adding = SidebarSyncStatus(variant: .syncing, text: "Adding your calendar…")

    private static func needsReconnect(_ connection: UserMetadataConnections) -> Bool {
        connection.connectionState == .rECONNECT_REQUIRED
            || connection.state == "disconnected"
            || connection.stateReason == "consentRequired"
    }

    /// Web `CONNECTION_STATE_PRECEDENCE`.
    private static func rank(_ connection: UserMetadataConnections) -> Int {
        switch connection.connectionState {
        case .rECONNECT_REQUIRED: 0
        case .aTTENTION: 1
        case .iMPORTING: 2
        case .hEALTHY: 3
        case .nOT_CONNECTED: 4
        }
    }
}
