import Foundation

enum PostHogAnalyticsStorageKeys {
    static let anonymousDistinctId = "COMPASS_POSTHOG_ANON_DISTINCT_ID"
    static let sessionId = "COMPASS_POSTHOG_SESSION_ID"
    static let sessionLastActivity = "COMPASS_POSTHOG_SESSION_LAST_ACTIVITY"
}

public enum PostHogAnalyticsIds {
    public static func makeLowercasedUUID() -> String {
        UUID().uuidString.lowercased()
    }
}

public protocol PostHogAnalyticsDefaults: Sendable {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
    func double(forKey key: String) -> Double
    func set(_ value: Double, forKey key: String)
    func removeObject(forKey key: String)
}

public struct UserDefaultsPostHogAnalyticsDefaults: PostHogAnalyticsDefaults, @unchecked Sendable {
    private let defaults: UserDefaults

    public init(_ defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func string(forKey key: String) -> String? {
        defaults.string(forKey: key)
    }

    public func set(_ value: String?, forKey key: String) {
        defaults.set(value, forKey: key)
    }

    public func double(forKey key: String) -> Double {
        defaults.double(forKey: key)
    }

    public func set(_ value: Double, forKey key: String) {
        defaults.set(value, forKey: key)
    }

    public func removeObject(forKey key: String) {
        defaults.removeObject(forKey: key)
    }
}

public final class PostHogAnalyticsDefaultsBox: PostHogAnalyticsDefaults, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String]
    private var numbers: [String: Double]

    public init(
        values: [String: String] = [:],
        numbers: [String: Double] = [:]
    ) {
        self.values = values
        self.numbers = numbers
    }

    public func string(forKey key: String) -> String? {
        lock.withLock { values[key] }
    }

    public func set(_ value: String?, forKey key: String) {
        lock.withLock {
            if let value {
                values[key] = value
            } else {
                values.removeValue(forKey: key)
            }
        }
    }

    public func double(forKey key: String) -> Double {
        lock.withLock { numbers[key] ?? 0 }
    }

    public func set(_ value: Double, forKey key: String) {
        lock.withLock { numbers[key] = value }
    }

    public func removeObject(forKey key: String) {
        lock.withLock {
            values.removeValue(forKey: key)
            numbers.removeValue(forKey: key)
        }
    }
}

private extension NSLock {
    func withLock<R>(_ body: () -> R) -> R {
        lock()
        defer { unlock() }
        return body()
    }
}
