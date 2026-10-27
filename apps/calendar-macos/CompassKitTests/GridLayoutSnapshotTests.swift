import Foundation
import XCTest
@testable import CompassKit

final class GridLayoutSnapshotTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EffectiveTimeZone.identifier = "UTC"
    }

    func testGridLayoutSnapshotsMatchExportedFixtures() throws {
        let document = try loadSnapshotDocument()
        let scenarios = try XCTUnwrap(document["scenarios"] as? [[String: Any]])

        for scenario in scenarios {
            let id = try XCTUnwrap(scenario["id"] as? String)
            guard id.hasPrefix("grid-layout-"), id != "grid-layout-day-mode" else { continue }

            let input = try XCTUnwrap(scenario["input"] as? [String: Any])
            let expected = try XCTUnwrap(scenario["output"])

            let colWidths = try XCTUnwrap(input["colWidths"] as? [Double])
            let visibleDateKeys = try XCTUnwrap(input["visibleDateKeys"] as? [String])
            let layoutModeRaw = try XCTUnwrap(input["layoutMode"] as? String)
            let layoutMode = GridLayoutMode(rawValue: layoutModeRaw) ?? .week

            let built = GridLayoutSnapshotBuilder.build(
                scenario: GridLayoutSnapshotFixtures.parityScenario(
                    layoutMode: layoutMode,
                    visibleDateKeys: visibleDateKeys
                ),
                colWidths: colWidths
            )

            let actual = try snapshotDictionary(built)
            XCTAssertJSONEqual(actual, expected, "grid layout snapshot \(id)")
        }
    }

    func testDraftOverlayMovesTimedDeckLayoutToDraftDay() throws {
        let thursday = "2026-05-22T22:00:00.000Z"
        let friday = "2026-05-23T22:00:00.000Z"
        var scenario = GridLayoutSnapshotFixtures.parityScenario(
            layoutMode: .week,
            visibleDateKeys: ["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]
        )
        scenario.timedEvents = [
            GridLayoutTimedEventInput(
                endDate: "2026-05-22T23:00:00.000Z",
                eventId: "original",
                startDate: thursday,
                title: "Original"
            ),
            GridLayoutTimedEventInput(
                endDate: "2026-05-22T23:00:00.000Z",
                eventId: "copy",
                startDate: thursday,
                title: "Copy"
            ),
        ]
        scenario.draftOverlay = GridLayoutDraftOverlay(
            eventId: "copy",
            schedule: DraftSchedule(
                start: CompassDateParsing.parseInEffectiveTimeZone(friday)!,
                end: CompassDateParsing.parseInEffectiveTimeZone("2026-05-23T23:00:00.000Z")!,
                kind: .timed
            ),
            title: "Copy"
        )

        let built = GridLayoutSnapshotBuilder.build(
            scenario: scenario,
            colWidths: Array(repeating: 140.0, count: 5)
        )

        let copyCards = built.cards.filter { $0.eventId == "copy" && $0.kind == .timed }
        XCTAssertEqual(copyCards.count, 1)
        XCTAssertTrue(copyCards[0].isDraft)
        let original = built.cards.first { $0.eventId == "original" && $0.kind == .timed }
        let copyWidth = copyCards[0].frame.width
        let originalWidth = try XCTUnwrap(original?.frame.width)
        XCTAssertGreaterThan(copyWidth, originalWidth * 0.95)
    }

    func testOverlapNeighbourExpandsAfterPartnerDeleted() throws {
        let visibleDateKeys = ["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]
        let overlapEvents = [
            GridLayoutTimedEventInput(
                calendarId: "507f1f77bcf86cd799439011",
                endDate: "2026-05-20T10:00:00.000",
                eventId: "overlap-a",
                startDate: "2026-05-20T09:00:00.000",
                title: "Overlap A"
            ),
            GridLayoutTimedEventInput(
                calendarId: "507f1f77bcf86cd799439011",
                endDate: "2026-05-20T10:30:00.000",
                eventId: "overlap-b",
                startDate: "2026-05-20T09:30:00.000",
                title: "Overlap B"
            ),
        ]

        var deckedScenario = GridLayoutSnapshotFixtures.parityScenario(
            layoutMode: .week,
            visibleDateKeys: visibleDateKeys
        )
        deckedScenario.timedEvents = overlapEvents
        deckedScenario.hiddenEventIds = []

        let decked = GridLayoutSnapshotBuilder.build(
            scenario: deckedScenario,
            colWidths: Array(repeating: 140.0, count: 5)
        )
        let deckedWidth = try XCTUnwrap(
            decked.cards.first { $0.eventId == "overlap-a" && $0.kind == .timed }?.frame.width
        )

        var soloScenario = deckedScenario
        soloScenario.timedEvents = [overlapEvents[0]]
        let solo = GridLayoutSnapshotBuilder.build(
            scenario: soloScenario,
            colWidths: Array(repeating: 140.0, count: 5)
        )
        let soloWidth = try XCTUnwrap(
            solo.cards.first { $0.eventId == "overlap-a" && $0.kind == .timed }?.frame.width
        )

        XCTAssertGreaterThan(soloWidth, deckedWidth * 0.95)
    }

    func testOverlapNeighbourExpandsAfterPartnerHidden() throws {
        let visibleDateKeys = ["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]
        let overlapEvents = [
            GridLayoutTimedEventInput(
                calendarId: "507f1f77bcf86cd799439011",
                endDate: "2026-05-20T10:00:00.000",
                eventId: "overlap-a",
                startDate: "2026-05-20T09:00:00.000",
                title: "Overlap A"
            ),
            GridLayoutTimedEventInput(
                calendarId: "507f1f77bcf86cd799439011",
                endDate: "2026-05-20T10:30:00.000",
                eventId: "overlap-b",
                startDate: "2026-05-20T09:30:00.000",
                title: "Overlap B"
            ),
        ]

        var deckedScenario = GridLayoutSnapshotFixtures.parityScenario(
            layoutMode: .week,
            visibleDateKeys: visibleDateKeys
        )
        deckedScenario.timedEvents = overlapEvents
        deckedScenario.hiddenEventIds = []

        let decked = GridLayoutSnapshotBuilder.build(
            scenario: deckedScenario,
            colWidths: Array(repeating: 140.0, count: 5)
        )
        let deckedWidth = try XCTUnwrap(
            decked.cards.first { $0.eventId == "overlap-a" && $0.kind == .timed }?.frame.width
        )

        var hiddenScenario = deckedScenario
        hiddenScenario.hiddenEventIds = ["overlap-b"]
        let hidden = GridLayoutSnapshotBuilder.build(
            scenario: hiddenScenario,
            colWidths: Array(repeating: 140.0, count: 5)
        )
        let soloWidth = try XCTUnwrap(
            hidden.cards.first { $0.eventId == "overlap-a" && $0.kind == .timed }?.frame.width
        )

        XCTAssertGreaterThan(soloWidth, deckedWidth * 0.95)
    }

    func testDayViewUsesOneColumnPerVisibleCalendar() throws {
        let built = GridLayoutSnapshotBuilder.build(
            scenario: GridLayoutSnapshotFixtures.parityScenario(
                layoutMode: .day,
                visibleDateKeys: ["2026-05-20"]
            ),
            colWidths: [320, 320]
        )

        XCTAssertEqual(built.layoutMode, .day)
        XCTAssertEqual(built.columns.count, 1)
        XCTAssertEqual(built.columns[0].key, "507f1f77bcf86cd799439011")
    }

    private func loadSnapshotDocument() throws -> [String: Any] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: "grid-layout.snapshots"))
        let data = try Data(contentsOf: url)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    private func snapshotDictionary(_ snapshot: GridLayoutSnapshot) throws -> Any {
        let data = try JSONEncoder().encode(snapshot)
        return try JSONSerialization.jsonObject(with: data)
    }
}
