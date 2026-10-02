import Foundation
import XCTest
@testable import CompassKit

final class LayoutParityTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EffectiveTimeZone.identifier = "UTC"
    }

    func testTimedDeckVectors() throws {
        let cases = try loadVectorCases(named: "timed-deck.vectors")
        for vectorCase in cases {
            let actual = try runTimedDeckCase(vectorCase)
            XCTAssertJSONEqual(
                actual,
                vectorCase["output"],
                "timed-deck case \(vectorCase["id"] ?? "unknown")"
            )
        }
    }

    func testNudgeVectors() throws {
        let cases = try loadVectorCases(named: "nudge.vectors")
        for vectorCase in cases {
            let actual = try runNudgeCase(vectorCase)
            XCTAssertJSONEqual(
                actual,
                vectorCase["output"],
                "nudge case \(vectorCase["id"] ?? "unknown")"
            )
        }
    }

    func testDeliberateOffByOneFailsTimedDeckLayout() throws {
        let cases = try loadVectorCases(named: "timed-deck.vectors")
        guard let overlapCase = cases.first(where: { ($0["id"] as? String) == "createTimedEventLayout-overlap" })
        else {
            XCTFail("missing overlap vector")
            return
        }

        let input = try XCTUnwrap(overlapCase["input"] as? [String: Any])
        let eventsJSON = try XCTUnwrap(input["events"] as? [[String: Any]])
        let events = eventsJSON.map { row in
            TimedDeckEventInput(
                id: row["_id"] as? String ?? "",
                startDate: row["startDate"] as? String ?? "",
                endDate: row["endDate"] as? String ?? ""
            )
        }

        var broken = TimedDeckLayoutEngine.createTimedEventLayout(events: events)
        if broken.indices.contains(1) {
            broken[1].deckLayout = TimedDeckLayout(groupSize: 2, order: 99)
        }

        let actual: [[String: Any]] = broken.map { item in
            var deck: [String: Any]?
            if let layout = item.deckLayout {
                deck = ["order": layout.order, "groupSize": layout.groupSize]
            }
            return [
                "eventId": item.eventId,
                "deckLayout": deck as Any,
                "isHidden": item.isHidden,
            ]
        }

        XCTAssertNotEqual(
            jsonString(actual),
            jsonString(overlapCase["output"])
        )
    }

    private func runTimedDeckCase(_ vectorCase: [String: Any]) throws -> Any? {
        let id = vectorCase["id"] as? String ?? ""
        let input = try XCTUnwrap(vectorCase["input"] as? [String: Any])

        switch id {
        case "createTimedEventLayout-overlap":
            let eventsJSON = try XCTUnwrap(input["events"] as? [[String: Any]])
            let hidden = Set((input["hiddenEventIds"] as? [String]) ?? [])
            let events = eventsJSON.map { row in
                TimedDeckEventInput(
                    id: row["_id"] as? String ?? "",
                    startDate: row["startDate"] as? String ?? "",
                    endDate: row["endDate"] as? String ?? ""
                )
            }
            return TimedDeckLayoutEngine.createTimedEventLayout(
                events: events,
                hiddenEventIds: hidden
            ).map { item in
                var deck: [String: Any]?
                if let layout = item.deckLayout {
                    deck = ["order": layout.order, "groupSize": layout.groupSize]
                }
                return [
                    "eventId": item.eventId,
                    "deckLayout": deck ?? NSNull(),
                    "isHidden": item.isHidden,
                ] as [String: Any]
            }

        case "applyTimedDeckPosition":
            let positionJSON = try XCTUnwrap(input["position"] as? [String: Any])
            let deckJSON = try XCTUnwrap(input["deckLayout"] as? [String: Any])
            let position = decodeEventPosition(positionJSON)
            let deck = TimedDeckLayout(
                groupSize: deckJSON["groupSize"] as? Int ?? 0,
                order: deckJSON["order"] as? Int ?? 0
            )
            return encodeEventPosition(TimedDeckLayoutEngine.applyTimedDeckPosition(position, deckLayout: deck))

        case "getTimedEventPosition":
            let measurements = try decodeGridMetrics(input["measurements"])
            let visible = GridVisibleDate.fromKeys((input["visibleDates"] as? [String]) ?? [])
            let timedInput = EventPositionCalculator.TimedEventInput(
                startDate: input["startDate"] as? String ?? "",
                endDate: input["endDate"] as? String ?? ""
            )
            return encodeEventPosition(
                EventPositionCalculator.getTimedEventPosition(
                    timedInput,
                    measurements: measurements,
                    visibleDates: visible
                )
            )

        case "getAllDayEventPosition":
            let measurements = try decodeGridMetrics(input["measurements"])
            let visible = GridVisibleDate.fromKeys((input["visibleDates"] as? [String]) ?? [])
            return encodeEventPosition(
                EventPositionCalculator.getAllDayEventPosition(
                    startDate: input["startDate"] as? String ?? "",
                    endDate: input["endDate"] as? String ?? "",
                    row: input["row"] as? Int,
                    measurements: measurements,
                    visibleDates: visible
                )
            )

        case "getBusyPeriodPosition":
            let measurements = try decodeGridMetrics(input["measurements"])
            let visible = GridVisibleDate.fromKeys((input["visibleDates"] as? [String]) ?? [])
            let segment = try XCTUnwrap(input["segment"] as? [String: Any])
            return encodeEventPosition(
                EventPositionCalculator.getBusyPeriodPosition(
                    segmentStart: segment["start"] as? String ?? "",
                    segmentEnd: segment["end"] as? String ?? "",
                    measurements: measurements,
                    visibleDates: visible
                )
            )

        case "applyTimedEventDisplayPosition":
            let positionJSON = try XCTUnwrap(input["position"] as? [String: Any])
            let position = decodeEventPosition(positionJSON)
            let deckJSON = input["deckLayout"] as? [String: Any]
            let deck = deckJSON.map {
                TimedDeckLayout(
                    groupSize: $0["groupSize"] as? Int ?? 0,
                    order: $0["order"] as? Int ?? 0
                )
            }
            let isHidden = input["isHidden"] as? Bool ?? false
            return encodeEventPosition(
                TimedDeckLayoutEngine.applyTimedEventDisplayPosition(
                    position,
                    deckLayout: deck,
                    isHidden: isHidden
                )
            )

        default:
            XCTFail("unknown timed-deck vector id \(id)")
            return nil
        }
    }

    private func runNudgeCase(_ vectorCase: [String: Any]) throws -> Any? {
        let input = try XCTUnwrap(vectorCase["input"] as? [String: Any])
        let activityRaw = input["activity"] as? String
        let activity = activityRaw.flatMap(DraftNudgeActivity.init(rawValue:))

        if activity == .eventRightClick, input["schedule"] == nil {
            return NSNull()
        }

        let schedule = try resolveNudgeSchedule(input: input)
        let key = input["key"] as? String ?? ""
        let isStartAllowed: ((Date) -> Bool)? =
            (input["isStartAllowed"] as? Bool == false) ? { _ in false } : nil

        let moved = DraftNudge.repositionDraftByKeyboard(
            activity: activity,
            schedule: schedule,
            key: key,
            isStartAllowed: isStartAllowed
        )

        guard let moved else { return NSNull() }

        return [
            "schedule": [
                "start": CompassDateParsing.formatISO8601UTC(moved.start),
                "end": CompassDateParsing.formatISO8601UTC(moved.end),
                "kind": moved.kind.rawValue,
            ] as [String: Any],
        ] as [String: Any]
    }

    private func resolveNudgeSchedule(input: [String: Any]) throws -> DraftSchedule {
        if let scheduleJSON = input["schedule"] as? [String: Any] {
            let kind = DraftSchedule.Kind(rawValue: scheduleJSON["kind"] as? String ?? "") ?? .timed
            let start = try XCTUnwrap(parseISOInstant(scheduleJSON["start"] as? String ?? ""))
            let end = try XCTUnwrap(parseISOInstant(scheduleJSON["end"] as? String ?? ""))
            return DraftSchedule(start: start, end: end, kind: kind)
        }
        return defaultNudgeDraftSchedule()
    }

    private func defaultNudgeDraftSchedule() -> DraftSchedule {
        let start = parseISOInstant("2026-05-20T09:00:00.000Z")!
        let end = parseISOInstant("2026-05-20T10:00:00.000Z")!
        return DraftSchedule(start: start, end: end, kind: .timed)
    }

    private func loadVectorCases(named name: String) throws -> [[String: Any]] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: name))
        let data = try Data(contentsOf: url)
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return try XCTUnwrap(root?["cases"] as? [[String: Any]])
    }

    private func decodeGridMetrics(_ value: Any?) throws -> GridMetrics {
        let dict = try XCTUnwrap(value as? [String: Any])
        let colWidths = (dict["colWidths"] as? [Any])?.map(numberValue) ?? []
        let hourHeight = numberValue(dict["hourHeight"])
        let mainGrid = decodeGridMeasurement(dict["mainGrid"])
        let allDayRow = decodeGridMeasurement(dict["allDayRow"])
        return GridMetrics(
            allDayRow: allDayRow,
            colWidths: colWidths,
            hourHeight: hourHeight,
            mainGrid: mainGrid
        )
    }

    private func decodeGridMeasurement(_ value: Any?) -> GridMeasurement? {
        guard let dict = value as? [String: Any] else { return nil }
        return GridMeasurement(
            bottom: numberValue(dict["bottom"]),
            height: numberValue(dict["height"]),
            left: numberValue(dict["left"]),
            right: numberValue(dict["right"]),
            top: numberValue(dict["top"]),
            width: numberValue(dict["width"]),
            x: numberValue(dict["x"]),
            y: numberValue(dict["y"])
        )
    }

    private func numberValue(_ value: Any?) -> Double {
        (value as? NSNumber)?.doubleValue ?? 0
    }

    private func decodeEventPosition(_ json: [String: Any]) -> EventPosition {
        EventPosition(
            height: numberValue(json["height"]),
            left: numberValue(json["left"]),
            top: numberValue(json["top"]),
            width: numberValue(json["width"]),
            zIndex: json["zIndex"] as? Int
        )
    }

    private func encodeEventPosition(_ position: EventPosition) -> [String: Any] {
        var json: [String: Any] = [
            "height": position.height,
            "left": position.left,
            "top": position.top,
            "width": position.width,
        ]
        if let zIndex = position.zIndex {
            json["zIndex"] = zIndex
        }
        return json
    }

    private func parseISOInstant(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}

enum JSONParityAssert {
    static func assertEqual(_ actual: Any?, _ expected: Any?, file: StaticString, line: UInt) {
        XCTAssertJSONEqual(actual, expected, "", file: file, line: line)
    }
}

func XCTAssertJSONEqual(
    _ actual: Any?,
    _ expected: Any?,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    let actualNormalized = normalizeJSON(actual)
    let expectedNormalized = normalizeJSON(expected)
    if !jsonEquals(actualNormalized, expectedNormalized) {
        XCTFail(
            """
            \(message())
            expected: \(jsonString(expectedNormalized))
            actual:   \(jsonString(actualNormalized))
            """,
            file: file,
            line: line
        )
    }
}

private func normalizeJSON(_ value: Any?) -> Any? {
    if value is NSNull { return NSNull() }
    guard let value else { return NSNull() }

    if let number = value as? NSNumber {
        if CFGetTypeID(number) == CFBooleanGetTypeID() {
            return number.boolValue
        }
        return number.doubleValue
    }

    if let array = value as? [Any] {
        return array.map { normalizeJSON($0) }
    }

    if let dict = value as? [String: Any] {
        return dict.mapValues { normalizeJSON($0) }
    }

    return value
}

private func jsonEquals(_ lhs: Any?, _ rhs: Any?) -> Bool {
    switch (lhs, rhs) {
    case (NSNull(), NSNull()):
        return true
    case let (left as Double, right as Double):
        return abs(left - right) < 0.000_1
    case let (left as Bool, right as Bool):
        return left == right
    case let (left as String, right as String):
        return left == right
    case let (left as [Any?], right as [Any?]):
        guard left.count == right.count else { return false }
        for (l, r) in zip(left, right) {
            if !jsonEquals(l, r) { return false }
        }
        return true
    case let (left as [String: Any?], right as [String: Any?]):
        guard left.keys.sorted() == right.keys.sorted() else { return false }
        for key in left.keys {
            if !jsonEquals(left[key] ?? NSNull(), right[key] ?? NSNull()) {
                return false
            }
        }
        return true
    default:
        return false
    }
}

private func jsonString(_ value: Any?) -> String {
    guard JSONSerialization.isValidJSONObject(value ?? NSNull()) else {
        return String(describing: value)
    }
    let data = try! JSONSerialization.data(withJSONObject: value ?? NSNull(), options: [.sortedKeys])
    return String(data: data, encoding: .utf8) ?? ""
}
