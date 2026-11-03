import CompassKit
import Foundation
import XCTest
@testable import CompassData

@MainActor
final class LifeStoreTests: XCTestCase {
    func testDatabaseWinsAndSequentialEditsUseUpdatedRevisions() async throws {
        let suite = "LifeStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LifeStore(defaults: defaults)
        XCTAssertTrue(store.updateBirthDate("1980-01-01"))
        let remote = LifeSettingsStub(response: LifePreferencesResponse(
            preferences: LifePreferencesResponsePreferences(birthDate: "1990-02-03", lifespan: 85, variation: .average), revision: 3))
        await store.load(userId: "a", remote: remote)
        XCTAssertEqual(store.preferences.birthDate, "1990-02-03")
        XCTAssertEqual(store.preferences.lifespan, 85)
        XCTAssertTrue(store.updateBirthDate("1991-02-03"))
        XCTAssertTrue(store.updateLifespan(90))
        await store.flushPendingChanges()
        let response = try await remote.lifePreferences()
        XCTAssertEqual(response.revision, 5)
        XCTAssertEqual(response.preferences?.birthDate, "1991-02-03")
        XCTAssertEqual(response.preferences?.lifespan, 90)
        let another = LifeSettingsStub(response: LifePreferencesResponse(preferences: nil, revision: 0))
        await store.load(userId: "b", remote: another)
        XCTAssertEqual(store.preferences.birthDate, "")
        await store.load(userId: nil, remote: another)
        XCTAssertEqual(store.preferences.birthDate, "1980-01-01")
    }

    func testPlaceholderBirthdayIsNotMigratedAsConfirmed() async throws {
        let suite = "LifeStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LifeStore(defaults: defaults)
        XCTAssertTrue(store.updateBirthDate("2000-01-01"))
        let remote = LifeSettingsStub(response: LifePreferencesResponse(preferences: nil, revision: 0))
        await store.load(userId: "a", remote: remote)
        let response = try await remote.lifePreferences()
        XCTAssertEqual(response.preferences?.birthDate, "")
        XCTAssertEqual(response.revision, 1)
    }

    func testSidebarEditsValidateAndPersistWithoutChangingVariation() throws {
        let suite = "LifeStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let today = try XCTUnwrap(LifeMath.parseLifeDate("2026-10-19"))
        let store = LifeStore(defaults: defaults, today: { today })
        XCTAssertTrue(store.updateBirthDate(" 1990-06-15 "))
        XCTAssertEqual(store.preferences.birthDate, "1990-06-15")
        XCTAssertFalse(store.updateBirthDate("2027-01-01"))
        XCTAssertFalse(store.updateBirthDate("1899-12-31"))
        XCTAssertFalse(store.updateBirthDate("2026-02-30"))
        XCTAssertEqual(store.preferences.birthDate, "1990-06-15")
        XCTAssertTrue(store.updateLifespan(200))
        XCTAssertEqual(store.preferences.lifespan, 150)
        XCTAssertTrue(store.updateLifespan(0))
        XCTAssertEqual(store.preferences.lifespan, 1)
        XCTAssertFalse(store.updateLifespan(.nan))
        XCTAssertEqual(store.preferences.variation, .average)
        let reloaded = LifeStore(defaults: defaults, today: { today })
        XCTAssertEqual(reloaded.preferences, store.preferences)
        XCTAssertTrue(store.updateBirthDate(""))
        XCTAssertFalse(store.hasBirthDate)
        XCTAssertEqual(store.summary, "Birth date not set")
    }

    func testRandomBirthDateEditKeepsLifespanAtLeastCurrentAge() throws {
        let suite = "LifeStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let today = try XCTUnwrap(LifeMath.parseLifeDate("2026-10-19"))
        let store = LifeStore(defaults: defaults, today: { today })
        store.shuffleRandomVariation()
        XCTAssertTrue(store.updateBirthDate("1990-01-01"))
        XCTAssertGreaterThanOrEqual(store.preferences.lifespan, 36)
        XCTAssertLessThanOrEqual(store.preferences.lifespan, 100)
        XCTAssertEqual(store.preferences.variation, .random)
    }
}

private actor LifeSettingsStub: LifePreferencesRemoteClient {
    private var response: LifePreferencesResponse
    init(response: LifePreferencesResponse) { self.response = response }
    func lifePreferences() async throws -> LifePreferencesResponse { response }
    func saveLifePreferences(_ preferences: LifePreferences, revision: Int) async throws -> LifePreferencesResponse {
        guard response.revision == revision else { throw StubError.conflict }
        response = LifePreferencesResponse(preferences: LifePreferencesResponsePreferences(
            birthDate: preferences.birthDate, lifespan: preferences.lifespan,
            variation: VariationEnum(rawValue: preferences.variation.rawValue)!), revision: revision + 1)
        return response
    }
    private enum StubError: Error { case conflict }
}
