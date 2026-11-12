import Foundation

/// Persistent week/day banner for an account that needs help. Mirrors web
/// `pickCalendarBannerTarget`, `getCalendarConnectionBannerKind`, and
/// `CalendarConnectionBanner` copy.
public struct CalendarConnectionBanner: Equatable, Sendable {
    public enum Kind: Int, Sendable, Comparable {
        case reconnect
        case consentRequired
        case importFailed
        case delayed

        public static func < (lhs: Kind, rhs: Kind) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    /// Web `CONSENT_REQUIRED_COPY`.
    public static let consentRequiredMessage =
        "Your organization's admin has to approve Compass before this account can connect."
    /// Web `MICROSOFT_SELF_HOSTING_DOC_URL`.
    public static let consentHelpURL = URL(
        string: "https://github.com/KeepSoftwareSimple/compass-calendar/blob/main/docs/self-hosting/microsoft-calendar.md")!

    public let connection: UserMetadataConnections
    public let kind: Kind

    public var isError: Bool { kind != .delayed }

    public var message: String {
        switch kind {
        case .reconnect:
            if let email = connection.accountEmail?.trimmingCharacters(in: .whitespaces), !email.isEmpty {
                return "\(email) needs reconnecting."
            }
            return "\(Self.productName(connection.provider)) needs reconnecting."
        case .consentRequired:
            return Self.consentRequiredMessage
        case .importFailed:
            return "Couldn't add your calendar."
        case .delayed:
            if connection.provider == .microsoft {
                if connection.stateReason == "providerErrors" {
                    return "Outlook updates are delayed: Microsoft is slow to respond."
                }
                return "Outlook updates are delayed."
            }
            if connection.stateReason == "providerErrors" {
                return "Google updates are delayed: Google is slow to respond."
            }
            return "Google updates are delayed."
        }
    }

    public var actionLabel: String {
        switch kind {
        case .reconnect: "Reconnect"
        case .consentRequired: "Learn more"
        case .importFailed: "Retry"
        case .delayed: "Refresh"
        }
    }

    /// The highest-precedence account across providers, or nil when all are healthy.
    public static func pick(_ connections: [UserMetadataConnections]) -> CalendarConnectionBanner? {
        connections
            .compactMap { connection in kind(for: connection).map { CalendarConnectionBanner(connection: connection, kind: $0) } }
            .min { $0.kind < $1.kind }
    }

    static func kind(for connection: UserMetadataConnections) -> Kind? {
        if connection.stateReason == "consentRequired" { return .consentRequired }
        if connection.connectionState == .rECONNECT_REQUIRED || connection.state == "disconnected" {
            return .reconnect
        }
        let attention = connection.connectionState == .aTTENTION || connection.state == "delayed"
        if attention, connection.lastHealthyAt == nil { return .importFailed }
        return attention ? .delayed : nil
    }

    private static func productName(_ provider: ProviderEnum?) -> String {
        switch provider {
        case .microsoft: "Microsoft Calendar"
        case .apple: "Apple Calendar"
        default: "Google Calendar"
        }
    }
}
