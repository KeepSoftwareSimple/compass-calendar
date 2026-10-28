import Foundation

/// Session ids for raw PostHog capture, aligned with posthog-js's 30 minute idle timeout.
public struct PostHogSessionController: Sendable {
    public static let idleTimeout: TimeInterval = 30 * 60

    private let defaults: PostHogAnalyticsDefaults
    private let generateSessionId: @Sendable () -> String
    private let now: @Sendable () -> Date

    public init(
        defaults: PostHogAnalyticsDefaults = UserDefaultsPostHogAnalyticsDefaults(),
        generateSessionId: @escaping @Sendable () -> String = {
            UUID().uuidString.lowercased()
        },
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.defaults = defaults
        self.generateSessionId = generateSessionId
        self.now = now
    }

    /// Returns the active session id, rotating when idle exceeds `idleTimeout`.
    public mutating func touchSessionId() -> String {
        let currentTime = now()
        let lastActivity = defaults.double(forKey: PostHogAnalyticsStorageKeys.sessionLastActivity)
        if let existing = defaults.string(forKey: PostHogAnalyticsStorageKeys.sessionId),
           !existing.isEmpty,
           lastActivity > 0,
           currentTime.timeIntervalSince1970 - lastActivity <= Self.idleTimeout
        {
            defaults.set(currentTime.timeIntervalSince1970, forKey: PostHogAnalyticsStorageKeys.sessionLastActivity)
            return existing
        }
        let sessionId = generateSessionId()
        defaults.set(sessionId, forKey: PostHogAnalyticsStorageKeys.sessionId)
        defaults.set(currentTime.timeIntervalSince1970, forKey: PostHogAnalyticsStorageKeys.sessionLastActivity)
        return sessionId
    }

    public mutating func resetSession() {
        defaults.removeObject(forKey: PostHogAnalyticsStorageKeys.sessionId)
        defaults.removeObject(forKey: PostHogAnalyticsStorageKeys.sessionLastActivity)
    }
}
