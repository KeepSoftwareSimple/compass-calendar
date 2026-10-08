import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class OnboardingStoreTests: XCTestCase {
    func testMarkWelcomeSeenPersistsDeviceFlag() {
        let defaults = UserDefaults(suiteName: "OnboardingStoreTests.welcome")!
        defaults.removePersistentDomain(forName: "OnboardingStoreTests.welcome")
        let store = OnboardingStore(defaults: defaults)
        XCTAssertFalse(store.hasSeenWelcome)
        store.markWelcomeSeen(exit: "explore")
        XCTAssertTrue(store.hasSeenWelcome)
        XCTAssertEqual(defaults.string(forKey: OnboardingStorageKeys.welcomeExit), "explore")
    }

    func testFirstEventDonePersists() {
        let defaults = UserDefaults(suiteName: "OnboardingStoreTests.firstEvent")!
        defaults.removePersistentDomain(forName: "OnboardingStoreTests.firstEvent")
        let store = OnboardingStore(defaults: defaults)
        store.dismissFirstEventPrompt()
        XCTAssertTrue(store.isFirstEventDone)
        XCTAssertEqual(
            defaults.string(forKey: OnboardingStorageKeys.firstEventDone),
            FirstEventDoneReason.dismissed.rawValue)
    }
}
