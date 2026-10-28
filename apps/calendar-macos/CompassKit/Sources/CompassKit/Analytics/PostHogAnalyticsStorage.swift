import Foundation

enum PostHogAnalyticsStorageKeys {
    static let anonymousDistinctId = "COMPASS_POSTHOG_ANON_DISTINCT_ID"
    static let sessionId = "COMPASS_POSTHOG_SESSION_ID"
    static let sessionLastActivity = "COMPASS_POSTHOG_SESSION_LAST_ACTIVITY"
}

public protocol PostHogAnalyticsDefaults: Sendable {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
    func double(forKey key: String) -> Double
    func set(_ value: Double, forKey key: String)
    func removeObject(forKey key: String)
}

extension UserDefaults: @unchecked Sendable {}

extension UserDefaults: PostHogAnalyticsDefaults {
    public func set(_ value: String?, forKey key: String) {
        set(value as Any?, forKey: key)
    }
}

public struct PostHogAnalyticsDefaultsBox: PostHogAnalyticsDefaults, @unchecked Sendable {
    private let storage: NSLock
    private var values: [String: String]
    private var numbers: [String: Double]

    public init(
        values: [String: String] = [:],
        numbers: [String: Double] = [:]
    ) {
        storage = NSLock()
        self.values = values
        self.numbers = numbers
    }

    public func string(forKey key: String) -> String? {
        storage.withLock { values[key] }
    }

    public func set(_ value: String?, forKey key: String) {
        storage.withLock {
            if let value {
                values[key] = value
            } else {
                values.removeValue(forKey: key)
            }
        }
    }

    public func double(forKey key: String) -> Double {
        storage.withLock { numbers[key] ?? 0 }
    }

    public func set(_ value: Double, forKey key: String) {
        storage.withLock { numbers[key] = value }
    }

    public func removeObject(forKey key: String) {
        storage.withLock {
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
