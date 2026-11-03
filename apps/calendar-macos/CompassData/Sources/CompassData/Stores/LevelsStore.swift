// Mirrors `apps/calendar-web/src/shortcuts/level/` and sidebar shortcut tips.

import CompassKit
import Foundation

public struct ShortcutTipSnapshot: Hashable, Sendable {
    public let shortcutId: String
    public let label: String
    public let keycaps: [String]

    public init(shortcutId: String, label: String, keycaps: [String]) {
        self.shortcutId = shortcutId
        self.label = label
        self.keycaps = keycaps
    }
}

public struct LevelUpToastSnapshot: Hashable, Sendable, Identifiable {
    public let id = UUID()
    public let title: String
    public let level: Int
    public let levelName: String
    public let used: Int
    public let total: Int

    public init(title: String, level: Int, levelName: String, used: Int, total: Int) {
        self.title = title
        self.level = level
        self.levelName = levelName
        self.used = used
        self.total = total
    }
}

@MainActor
@Observable
public final class LevelsStore {
    public private(set) var levelSnapshot: ShortcutLevelSnapshot
    public private(set) var badgeHidden: Bool
    public private(set) var tipsMuted: Bool
    public private(set) var badgePulsing = false
    public private(set) var currentTip: ShortcutTipSnapshot?
    public private(set) var pendingLevelUpToast: LevelUpToastSnapshot?
    public private(set) var hintShortcutChipPulseKey: String?

    private let registryIds: [String]
    private let registryRows: [ShortcutRegistryEntry]
    private let levelDefinitions: [ShortcutLevelDefinition]
    private let defaults: ShortcutUsageDefaults
    private let analytics: ProductAnalyticsClient
    private var usedIds: Set<String>
    private var tipRotationIndex: Int

    public init(
        registry: ShortcutRegistry,
        defaults: ShortcutUsageDefaults = UserDefaults.standard,
        analytics: ProductAnalyticsClient = NoOpProductAnalyticsClient()
    ) {
        registryIds = registry.entries.map(\.id.rawValue)
        registryRows = registry.entries
        levelDefinitions = registry.levelDefinitions
        self.defaults = defaults
        self.analytics = analytics
        let profile = ShortcutUsagePersistence.readProfile(from: defaults)
        let initialUsedIds = ShortcutUsagePersistence.usedShortcutIds(from: profile)
        usedIds = initialUsedIds
        badgeHidden = defaults.bool(forKey: ShortcutUsageStorageKeys.levelHidden)
        tipsMuted = defaults.bool(forKey: ShortcutUsageStorageKeys.tipsMuted)
        tipRotationIndex = defaults.integer(forKey: ShortcutUsageStorageKeys.tipRotationIndex)
        levelSnapshot = ShortcutLevelMath.compute(
            usedIds: initialUsedIds,
            registryIds: registryIds,
            levels: levelDefinitions)
        currentTip = nil
        refreshTip()
        seedCelebratedLevelIfNeeded()
    }

    public var badgeLabel: String {
        "Lv \(levelSnapshot.level)"
    }

    public func recordShortcutInvocation(_ id: ShortcutId, section: String) {
        let raw = id.rawValue
        let usedDisplayedTip = currentTip?.shortcutId == raw
        var profile = ShortcutUsagePersistence.readProfile(from: defaults)
        var usage = profile.shortcuts[raw] ?? ShortcutUsageCounter(invocations: 0)
        usage.invocations += 1
        profile.shortcuts[raw] = usage
        ShortcutUsagePersistence.writeProfile(profile, to: defaults)
        usedIds.insert(raw)

        analytics.track(
            .shortcutInvoked,
            properties: [
                "shortcut_id": .string(raw),
                "section": .string(section),
                "invocation_method": .string("keyboard"),
                "outcome": .string("handled"),
                "source": .string("keyboard"),
            ])

        tryCelebrateVisibleHintShortcut(id.rawValue)

        let previousLevel = levelSnapshot.level
        recomputeLevel()
        if !badgeHidden, levelSnapshot.level > previousLevel {
            celebrateLevelUp()
        }
        if usedDisplayedTip { advanceTipRotation() }
    }

    public func setTipsMuted(_ muted: Bool) {
        guard muted != tipsMuted else { return }
        tipsMuted = muted
        defaults.set(muted, forKey: ShortcutUsageStorageKeys.tipsMuted)
        if muted {
            currentTip = nil
        } else {
            refreshTip()
        }
    }

    /// Parity captures pin a deterministic idle tip (web sidebar status bar).
    public func pinShortcutTip(id: String) {
        guard !tipsMuted, !badgeHidden,
              let row = registryRows.first(where: { $0.id.rawValue == id })
        else { return }
        currentTip = ShortcutTipSnapshot(
            shortcutId: row.id.rawValue,
            label: row.label,
            keycaps: row.displayKeycaps)
    }

    public func setBadgeHidden(_ hidden: Bool) {
        guard hidden != badgeHidden else { return }
        badgeHidden = hidden
        defaults.set(hidden, forKey: ShortcutUsageStorageKeys.levelHidden)
        analytics.track(
            .shortcutLevelBadgeToggled,
            properties: ["hidden": .bool(hidden)])
        if !hidden, levelSnapshot.level > celebratedLevel() {
            celebrateLevelUp()
        }
        if hidden {
            currentTip = nil
        } else {
            refreshTip()
        }
    }

    public func consumeLevelUpToast() {
        pendingLevelUpToast = nil
        badgePulsing = false
    }

    public func resetForTests() {
        usedIds = []
        badgeHidden = false
        badgePulsing = false
        pendingLevelUpToast = nil
        tipRotationIndex = 0
        levelSnapshot = ShortcutLevelMath.compute(
            usedIds: usedIds,
            registryIds: registryIds,
            levels: levelDefinitions)
        refreshTip()
    }

    private func recomputeLevel() {
        levelSnapshot = ShortcutLevelMath.compute(
            usedIds: usedIds,
            registryIds: registryIds,
            levels: levelDefinitions)
    }

    private func celebratedLevel() -> Int {
        Int(defaults.string(forKey: ShortcutUsageStorageKeys.levelCelebrated) ?? "") ?? 0
    }

    private func seedCelebratedLevelIfNeeded() {
        if defaults.string(forKey: ShortcutUsageStorageKeys.levelCelebrated) == nil {
            defaults.set(String(levelSnapshot.level), forKey: ShortcutUsageStorageKeys.levelCelebrated)
        }
    }

    private func celebrateLevelUp() {
        defaults.set(String(levelSnapshot.level), forKey: ShortcutUsageStorageKeys.levelCelebrated)
        badgePulsing = true
        pendingLevelUpToast = LevelUpToastSnapshot(
            title: "Level \(levelSnapshot.level): \(levelSnapshot.name). \(levelSnapshot.used) shortcuts learned.",
            level: levelSnapshot.level,
            levelName: levelSnapshot.name,
            used: levelSnapshot.used,
            total: levelSnapshot.total)
        analytics.track(
            .shortcutLevelUp,
            properties: [
                "level": .int(levelSnapshot.level),
                "level_name": .string(levelSnapshot.name),
                "used": .int(levelSnapshot.used),
                "total": .int(levelSnapshot.total),
            ])
    }

    private func refreshTip() {
        guard !tipsMuted, !badgeHidden else {
            currentTip = nil
            return
        }
        let unused = registryRows.filter { !usedIds.contains($0.id.rawValue) }
        guard !unused.isEmpty else {
            currentTip = nil
            return
        }
        let index = tipRotationIndex % unused.count
        let row = unused[index]
        currentTip = ShortcutTipSnapshot(
            shortcutId: row.id.rawValue,
            label: row.label,
            keycaps: row.displayKeycaps)
    }

    private func advanceTipRotation() {
        tipRotationIndex += 1
        defaults.set(tipRotationIndex, forKey: ShortcutUsageStorageKeys.tipRotationIndex)
        refreshTip()
    }

    private func celebratedHintShortcutKeys() -> Set<String> {
        guard
            let data = defaults.data(forKey: ShortcutUsageStorageKeys.hintFirstUsed),
            let keys = try? JSONDecoder().decode([String].self, from: data)
        else {
            return []
        }
        return Set(keys)
    }

    private func markHintShortcutCelebrated(_ key: String) {
        var keys = celebratedHintShortcutKeys()
        keys.insert(key)
        guard let data = try? JSONEncoder().encode(Array(keys).sorted()) else { return }
        defaults.set(data, forKey: ShortcutUsageStorageKeys.hintFirstUsed)
    }

    /// Merges account-level hint celebrations into device storage (e.g. after sign-in).
    public func mergeHintShortcutCelebration(hintFirstUsed: [String]?) {
        guard let hintFirstUsed, !hintFirstUsed.isEmpty else { return }
        var keys = celebratedHintShortcutKeys()
        let before = keys
        for key in hintFirstUsed {
            keys.insert(key)
        }
        guard keys != before else { return }
        guard let data = try? JSONEncoder().encode(Array(keys).sorted()) else { return }
        defaults.set(data, forKey: ShortcutUsageStorageKeys.hintFirstUsed)
    }

    private func claimHintShortcutCelebration(_ shortcutId: String) -> Bool {
        guard !celebratedHintShortcutKeys().contains(shortcutId) else { return false }
        markHintShortcutCelebrated(shortcutId)
        return true
    }

    private func tryCelebrateVisibleHintShortcut(_ shortcutId: String) {
        guard let tip = currentTip, tip.shortcutId == shortcutId else { return }
        guard claimHintShortcutCelebration(shortcutId) else { return }
        hintShortcutChipPulseKey = shortcutId
        analytics.track(
            .hintShortcutFirstUsed,
            properties: ["shortcut": .string(shortcutId)])
        onHintFirstUsedAccountSync?(Array(celebratedHintShortcutKeys()).sorted())
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            if hintShortcutChipPulseKey == shortcutId {
                hintShortcutChipPulseKey = nil
            }
        }
    }

    /// When set, invoked with the full local hint-first-used list after a new claim.
    public var onHintFirstUsedAccountSync: (([String]) -> Void)?
}

public enum ShortcutTelemetrySection {
    public static func section(for id: ShortcutId) -> String? {
        let prefix = id.rawValue.split(separator: "-").first.map(String.init) ?? ""
        switch prefix {
        case "nav":
            return "navigate"
        case "create":
            return "create"
        case "focus":
            return "focus"
        case "edit":
            return "edit"
        case "other":
            return "other"
        default:
            return nil
        }
    }
}
