import Foundation
import XCTest
@testable import CompassKit

final class BookingSetupStepsParityTests: XCTestCase {
    func testBookingSetupStepsVectors() throws {
        let cases = try loadVectorCases(named: "booking-setup-steps.vectors")
        for vectorCase in cases {
            let id = vectorCase["id"] as? String ?? "unknown"
            let input = try XCTUnwrap(vectorCase["input"] as? [String: Any])
            let output = try XCTUnwrap(vectorCase["output"] as? [String: Any])
            let writableCount = input["writableCalendarCount"] as? Int ?? 0

            if let visible = output["visible"] as? [String] {
                let expected = visible.compactMap(BookingSetupStepId.init(rawValue:))
                XCTAssertEqual(
                    BookingSetupSteps.visibleSetupSteps(writableCalendarCount: writableCount),
                    expected,
                    "visible steps mismatch for \(id)"
                )
            }

            if let sentence = output["sentence"] as? String,
               let stepRaw = input["stepId"] as? String,
               let step = BookingSetupStepId(rawValue: stepRaw)
            {
                XCTAssertEqual(
                    BookingSetupSteps.setupStepSentence(step, writableCalendarCount: writableCount),
                    sentence,
                    "sentence mismatch for \(id)"
                )
            }

            if let next = output["nextFromAddress"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.nextSetupStep(.address, writableCalendarCount: writableCount)?
                        .rawValue,
                    next
                )
            }
            if let next = output["nextFromHours"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.nextSetupStep(.hours, writableCalendarCount: writableCount)?
                        .rawValue,
                    next
                )
            }
            if let next = output["nextFromDuration"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.nextSetupStep(.duration, writableCalendarCount: writableCount)?
                        .rawValue,
                    next
                )
            }
            if let next = output["nextFromDestination"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.nextSetupStep(.destination, writableCalendarCount: writableCount)?
                        .rawValue,
                    next
                )
            }
            if let next = output["nextFromLive"] as? String? {
                let actual = BookingSetupSteps.nextSetupStep(.live, writableCalendarCount: writableCount)?
                    .rawValue
                XCTAssertEqual(actual, next)
            }

            if let prev = output["prevFromAddress"] as? String? {
                let actual = BookingSetupSteps.prevSetupStep(.address, writableCalendarCount: writableCount)?
                    .rawValue
                XCTAssertEqual(actual, prev)
            }
            if let prev = output["prevFromHours"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.prevSetupStep(.hours, writableCalendarCount: writableCount)?
                        .rawValue,
                    prev
                )
            }
            if let prev = output["prevFromDuration"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.prevSetupStep(.duration, writableCalendarCount: writableCount)?
                        .rawValue,
                    prev
                )
            }
            if let prev = output["prevFromLive"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.prevSetupStep(.live, writableCalendarCount: writableCount)?
                        .rawValue,
                    prev
                )
            }
            if let prev = output["prevFromDestination"] as? String {
                XCTAssertEqual(
                    BookingSetupSteps.prevSetupStep(.destination, writableCalendarCount: writableCount)?
                        .rawValue,
                    prev
                )
            }

            if let progress = output["progressAddress"] as? [String: Int] {
                let actual = BookingSetupSteps.setupStepProgress(
                    stepId: .address,
                    writableCalendarCount: 1
                )
                XCTAssertEqual(actual.current, progress["current"])
                XCTAssertEqual(actual.total, progress["total"])
            }
            if let progress = output["progressLiveTwo"] as? [String: Int] {
                let actual = BookingSetupSteps.setupStepProgress(
                    stepId: .live,
                    writableCalendarCount: 2
                )
                XCTAssertEqual(actual.current, progress["current"])
                XCTAssertEqual(actual.total, progress["total"])
            }
            if let progress = output["progressDurationTwo"] as? [String: Int] {
                let actual = BookingSetupSteps.setupStepProgress(
                    stepId: .duration,
                    writableCalendarCount: 2
                )
                XCTAssertEqual(actual.current, progress["current"])
                XCTAssertEqual(actual.total, progress["total"])
            }
            if let progress = output["progressDestinationZero"] as? [String: Int] {
                let actual = BookingSetupSteps.setupStepProgress(
                    stepId: .destination,
                    writableCalendarCount: 0
                )
                XCTAssertEqual(actual.current, progress["current"])
                XCTAssertEqual(actual.total, progress["total"])
            }
        }
    }

    private func loadVectorCases(named name: String) throws -> [[String: Any]] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: name))
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        return try XCTUnwrap(json?["cases"] as? [[String: Any]])
    }
}
