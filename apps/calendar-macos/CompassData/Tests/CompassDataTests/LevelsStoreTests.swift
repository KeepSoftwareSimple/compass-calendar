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

    func testTipRotationUsesUnusedRegistryRows() throws {
        let registry = try ShortcutRegistry()
        let store = LevelsStore(registry: registry, defaults: MemoryDefaults())
        let firstTip = store.currentTip?.shortcutId
        store.recordShortcutInvocation(.navNext, section: "navigate")
        XCTAssertNotEqual(store.currentTip?.shortcutId, firstTip)
    }
}
