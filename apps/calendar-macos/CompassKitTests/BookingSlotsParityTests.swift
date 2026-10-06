import Foundation
import XCTest
@testable import CompassKit

final class BookingSlotsParityTests: XCTestCase {
    func testBookingSlotsVectors() throws {
        let cases = try loadVectorCases(named: "booking-slots.vectors")
        for vectorCase in cases {
            let id = vectorCase["id"] as? String ?? "unknown"
            let input = try XCTUnwrap(vectorCase["input"] as? [String: Any])
            let output = try XCTUnwrap(vectorCase["output"] as? [String: Any])
            let expectedSlots = output["slots"] as? [String] ?? []

            let weeklyRaw = input["weeklyAvailability"] as? [[String: Any]] ?? []
            let weekly = weeklyRaw.compactMap { row -> BookingPageWeeklyAvailability? in
                guard let weekday = row["weekday"] as? Int,
                      let start = row["start"] as? String,
                      let end = row["end"] as? String,
                      let weekdayEnum = WeekdayEnum(rawValue: weekday)
                else { return nil }
                return BookingPageWeeklyAvailability(
                    end: end,
                    start: start,
                    weekday: weekdayEnum
                )
            }

            let busyRaw = input["busyIntervals"] as? [[String: String]] ?? []
            let busy = busyRaw.compactMap { row -> BookingBusyInterval? in
                guard let startText = row["start"],
                      let endText = row["end"],
                      let start = parseISO8601(startText),
                      let end = parseISO8601(endText)
                else { return nil }
                return BookingBusyInterval(start: start, end: end)
            }

            let reservations = (input["confirmedReservationStarts"] as? [String] ?? [])
                .compactMap(parseISO8601)

            let computeInput = ComputeBookingSlotsInput(
                timeZone: input["timeZone"] as? String ?? "UTC",
                durationMinutes: input["durationMinutes"] as? Int ?? 30,
                weeklyAvailability: weekly,
                minNoticeHours: input["minNoticeHours"] as? Int ?? 0,
                maxHorizonDays: input["maxHorizonDays"] as? Int ?? 60,
                busyIntervals: busy,
                confirmedReservationStarts: reservations,
                now: parseISO8601(input["now"] as? String ?? "") ?? Date(),
                windowStart: parseISO8601(input["windowStart"] as? String ?? "") ?? Date(),
                windowEnd: parseISO8601(input["windowEnd"] as? String ?? "") ?? Date()
            )

            let actual = ComputeBookingSlots.computeBookingSlots(computeInput)
            XCTAssertEqual(actual, expectedSlots, "slots mismatch for \(id)")
        }
    }

    private func loadVectorCases(named name: String) throws -> [[String: Any]] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: name))
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        return try XCTUnwrap(json?["cases"] as? [[String: Any]])
    }

    private func parseISO8601(_ value: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }
}
