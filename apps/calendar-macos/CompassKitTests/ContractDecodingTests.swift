import Foundation
import XCTest
@testable import CompassKit

final class ContractDecodingTests: XCTestCase {
    func testEventFixtureRoundTrip() throws {
        try assertFixtureRoundTrip("event", Event.self)
    }

    func testServerMessageFixtureRoundTrip() throws {
        try assertFixtureRoundTrip("server-message", ServerMessage.self)
    }

    func testCalendarListResponseFixtureRoundTrip() throws {
        try assertFixtureRoundTrip("calendar-list-response", CalendarListResponse.self)
    }

    private func assertFixtureRoundTrip<T: Codable & Equatable>(
        _ name: String,
        _ type: T.Type
    ) throws {
        let url = try XCTUnwrap(ContractTestFixtures.url(named: name))
        let data = try Data(contentsOf: url)
        let decoded = try JSONDecoder().decode(T.self, from: data)
        let reencoded = try JSONEncoder().encode(decoded)
        let roundTrip = try JSONDecoder().decode(T.self, from: reencoded)
        XCTAssertEqual(decoded, roundTrip)
    }
}
