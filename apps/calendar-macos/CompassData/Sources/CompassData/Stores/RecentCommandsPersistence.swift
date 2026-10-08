import Foundation

public enum RecentCommandsPersistence {
    public static let storageKey = "compass.commands.recent"
    public static let maxCount = 8

    public static func read(from defaults: UserDefaults = .standard) -> [String] {
        guard let raw = defaults.string(forKey: storageKey),
              let data = raw.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String].self, from: data)
        else {
            return []
        }
        return decoded
    }

    @discardableResult
    public static func write(_ ids: [String], to defaults: UserDefaults = .standard) -> Bool {
        guard let data = try? JSONEncoder().encode(ids),
              let raw = String(data: data, encoding: .utf8)
        else { return false }
        defaults.set(raw, forKey: storageKey)
        return true
    }

    public static func record(_ id: String, existing: [String]) -> [String] {
        Array([id] + existing.filter { $0 != id }.prefix(maxCount - 1))
    }
}
