@testable import CompassData
import CompassKit
import XCTest

@MainActor
final class LevelsStoreTests: XCTestCase {
    private final class MemoryDefaults: ShortcutUsageDefaults, @unchecked Sendable {
        private var storage: [String: Any] = [:]

        func data(forKey key: String) -> Data? {
            storage[key] as? Data
        }

        func set(_ data: Data?, forKey key: String) {
            storage[key] = data
        }

        func bool(forKey key: String) -> Bool {
            storage[key] as? Bool ?? false
        }

        func set(_ value: Bool, forKey key: String) {
            storage[key] = value
        }

        func integer(forKey key: String) -> Int {
            storage[key] as? Int ?? 0
        }

        func set(_ value: Int, forKey key: String) {
            storage[key] = value
        }

        func string(forKey key: String) -> String? {
            storage[key] as? String
        }

        func set(_ value: String?, forKey key: String) {
            storage[key] = value
        }
    }

    private final class RecordingAnalytics: ProductAnalyticsClient, @unchecked Sendable {
        var events: [(ProductEvent, ProductEventProperties)] = []

        func track(_ event: ProductEvent, properties: ProductEventProperties) {
            events.append((event, properties))
        }
    }

    func testLevelUpAfterFourthDistinctShortcut() throws {
        let registry = try ShortcutRegistry()
        let defaults = MemoryDefaults()
        defaults.set("1", forKey: ShortcutUsageStorageKeys.levelCelebrated)
        let analytics = RecordingAnalytics()
        let store = LevelsStore(registry: registry, defaults: defaults, analytics: analytics)

        store.recordShortcutInvocation(.navNext, section: "navigate")
        store.recordShortcutInvocation(.navPrevious, section: "navigate")
        store.recordShortcutInvocation(.navToday, section: "navigate")
        XCTAssertNil(store.pendingLevelUpToast)

        store.recordShortcutInvocation(.navShiftLeft, section: "navigate")
        XCTAssertEqual(store.levelSnapshot.level, 2)
        XCTAssertNotNil(store.pendingLevelUpToast)
        XCTAssertTrue(analytics.events.contains(where: { $0.0 == .shortcutLevelUp }))
    }

    func testUnrelatedAndRepeatedNavigationKeepsDisplayedTipStable() throws {
        let registry = try ShortcutRegistry()
        let defaults = MemoryDefaults()
        let store = LevelsStore(registry: registry, defaults: defaults)
        store.pinShortcutTip(id: ShortcutId.focusPageJump.rawValue)
        let tip = try XCTUnwrap(store.currentTip)
        for _ in 0 ..< 8 {
            store.recordShortcutInvocation(.navScrollHourDown, section: "navigate")
            store.recordShortcutInvocation(.navScrollHourUp, section: "navigate")
            XCTAssertEqual(store.currentTip, tip)
        }
        let usage = ShortcutUsagePersistence.readProfile(from: defaults)
        XCTAssertEqual(usage.shortcuts[ShortcutId.navScrollHourDown.rawValue]?.invocations, 8)
        XCTAssertEqual(usage.shortcuts[ShortcutId.navScrollHourUp.rawValue]?.invocations, 8)
        store.recordShortcutInvocation(.focusPageJump, section: "focus")
        XCTAssertNotEqual(store.currentTip?.shortcutId, tip.shortcutId)
        XCTAssertNotEqual(store.currentTip?.shortcutId, ShortcutId.navScrollHourDown.rawValue)
        XCTAssertNotEqual(store.currentTip?.shortcutId, ShortcutId.navScrollHourUp.rawValue)
    }

    func testHintCelebrationOnlyFiresOncePerPinnedTip() throws {
        let registry = try ShortcutRegistry()
        let defaults = MemoryDefaults()
        let analytics = RecordingAnalytics()
        let store = LevelsStore(registry: registry, defaults: defaults, analytics: analytics)
        store.pinShortcutTip(id: ShortcutId.navNext.rawValue)

        store.recordShortcutInvocation(.navNext, section: "navigate")
        store.recordShortcutInvocation(.navNext, section: "navigate")

        let hintEvents = analytics.events.filter { $0.0 == .hintShortcutFirstUsed }
        XCTAssertEqual(hintEvents.count, 1)
    }

    func testHintCelebrationSkipsWhenAccountAlreadyMarkedSeen() throws {
        let registry = try ShortcutRegistry()
        let defaults = MemoryDefaults()
        let seen = try JSONEncoder().encode([ShortcutId.navNext.rawValue])
        defaults.set(seen, forKey: ShortcutUsageStorageKeys.hintFirstUsed)
        let analytics = RecordingAnalytics()
        let store = LevelsStore(registry: registry, defaults: defaults, analytics: analytics)
        store.mergeHintShortcutCelebration(hintFirstUsed: [ShortcutId.navNext.rawValue])
        store.pinShortcutTip(id: ShortcutId.navNext.rawValue)

        store.recordShortcutInvocation(.navNext, section: "navigate")

        XCTAssertFalse(analytics.events.contains(where: { $0.0 == .hintShortcutFirstUsed }))
    }

    func testHintCelebrationPersistsBeforePulseAcrossNewStoreInstance() throws {
        let registry = try ShortcutRegistry()
        let defaults = MemoryDefaults()
        let analytics = RecordingAnalytics()
        let store = LevelsStore(registry: registry, defaults: defaults, analytics: analytics)
        store.pinShortcutTip(id: ShortcutId.navNext.rawValue)
        store.recordShortcutInvocation(.navNext, section: "navigate")

        let reloaded = LevelsStore(registry: registry, defaults: defaults, analytics: RecordingAnalytics())
        reloaded.pinShortcutTip(id: ShortcutId.navNext.rawValue)
        reloaded.recordShortcutInvocation(.navNext, section: "navigate")

        XCTAssertEqual(analytics.events.filter { $0.0 == .hintShortcutFirstUsed }.count, 1)
    }
}
