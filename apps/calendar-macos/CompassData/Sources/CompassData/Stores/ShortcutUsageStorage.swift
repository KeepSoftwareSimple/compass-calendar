import Foundation

enum ShortcutUsageStorageKeys {
    static let personalization = "compass.shortcuts.personalization"
    static let levelHidden = "compass.shortcuts.level-hidden"
    static let levelCelebrated = "compass.shortcuts.level-celebrated"
    static let tipRotationIndex = "compass.shortcuts.tip-rotation-index"
}

struct ShortcutUsageProfile: Codable, Equatable, Sendable {
    var version: Int
    var shortcuts: [String: ShortcutUsageCounter]

    static let empty = ShortcutUsageProfile(version: 2, shortcuts: [:])
}

struct ShortcutUsageCounter: Codable, Equatable, Sendable {
    var invocations: Int
}

public protocol ShortcutUsageDefaults: Sendable {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
    func bool(forKey key: String) -> Bool
    func set(_ value: Bool, forKey key: String)
    func integer(forKey key: String) -> Int
    func set(_ value: Int, forKey key: String)
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
}

extension UserDefaults: @unchecked Sendable {}

extension UserDefaults: ShortcutUsageDefaults {
    public func set(_ data: Data?, forKey key: String) {
        set(data as Any?, forKey: key)
    }

    public func set(_ value: String?, forKey key: String) {
        set(value as Any?, forKey: key)
    }
}

enum ShortcutUsagePersistence {
    static func readProfile(from defaults: ShortcutUsageDefaults) -> ShortcutUsageProfile {
        guard
            let data = defaults.data(forKey: ShortcutUsageStorageKeys.personalization),
            let profile = try? JSONDecoder().decode(ShortcutUsageProfile.self, from: data)
        else {
            return .empty
        }
        return profile
    }

    static func writeProfile(_ profile: ShortcutUsageProfile, to defaults: ShortcutUsageDefaults) {
        guard let data = try? JSONEncoder().encode(profile) else { return }
        defaults.set(data, forKey: ShortcutUsageStorageKeys.personalization)
    }

    static func usedShortcutIds(from profile: ShortcutUsageProfile) -> Set<String> {
        Set(
            profile.shortcuts.compactMap { id, usage in
                usage.invocations > 0 ? id : nil
            })
    }
}
