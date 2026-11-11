import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class PointerHintStoreTests: XCTestCase {
    func testPulseShowsHintAndHideClearsVisibility() throws {
        let store = PointerHintStore()
        let registry = try ShortcutRegistry()
        store.pulse(target: .allDaySlot, registry: registry)
        XCTAssertTrue(store.isVisible)
        XCTAssertNotNil(store.attempt)
        store.hide()
        XCTAssertFalse(store.isVisible)
        XCTAssertNil(store.focusedGridEventLabel)
    }

    func testHideCancelsScheduledAutoHide() async throws {
        let store = PointerHintStore()
        let registry = try ShortcutRegistry()
        store.pulse(target: .allDaySlot, registry: registry)
        store.hide()
        try await Task.sleep(for: .milliseconds(2600))
        XCTAssertFalse(store.isVisible)
    }

    func testAutoHideMatchesWebVisibleWindow() async throws {
        let store = PointerHintStore()
        let registry = try ShortcutRegistry()
        store.pulse(target: .allDaySlot, registry: registry)
        XCTAssertTrue(store.isVisible)
        try await Task.sleep(for: .milliseconds(2600))
        XCTAssertFalse(store.isVisible)
    }
}
