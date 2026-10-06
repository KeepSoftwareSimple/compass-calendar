@testable import CompassData
import CompassKit
import XCTest

final class ContactSuggestionDebouncerTests: XCTestCase {
    func testDebounceCoalescesRapidQueries() async {
        let calls = CallCounter()
        let debouncer = ContactSuggestionDebouncer(debounceMilliseconds: 80) { query in
            await calls.record(query)
            return [DraftAttendeeInput(email: "\(query)@example.com", displayName: nil)]
        }

        async let first = debouncer.suggestions(for: "ad")
        async let second = debouncer.suggestions(for: "ada")
        _ = await (first, second)

        let recorded = await calls.queries
        XCTAssertEqual(recorded, ["ada"])
    }

    func testShortQueryReturnsEmptyWithoutFetch() async {
        let calls = CallCounter()
        let debouncer = ContactSuggestionDebouncer(debounceMilliseconds: 0) { query in
            await calls.record(query)
            return []
        }

        let result = await debouncer.suggestions(for: "a")
        XCTAssertTrue(result.isEmpty)
        let recorded = await calls.queries
        XCTAssertTrue(recorded.isEmpty)
    }
}

private actor CallCounter {
    private(set) var queries: [String] = []

    func record(_ query: String) {
        queries.append(query)
    }
}
