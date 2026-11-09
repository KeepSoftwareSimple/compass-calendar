@testable import CompassData
import CompassKit
import XCTest

final class GridEventDraftColorPreservationTests: XCTestCase {
    func testOptimisticScheduleEditPreservesProviderColorHex() throws {
        let baseline = sampleTimedEvent(
            content: .details(
                EventContent_DetailsPayload(
                    colorHex: "#E67C73",
                    description: "",
                    kind: "details",
                    title: "Devotion"
                )
            ),
            recurrence: .occurrence(.init(kind: "occurrence", seriesId: EventId(rawValue: "bbbbbbbbbbbbbbbbbbbbbbbb")))
        )
        var draft = try XCTUnwrap(GridEventDraftFromEvent.editDraft(from: baseline))
        draft.schedule = DraftSchedule(
            start: baseline.scheduleStartDate().addingTimeInterval(3600),
            end: baseline.scheduleEndDate().addingTimeInterval(3600),
            kind: .timed
        )
        let optimistic = try XCTUnwrap(GridEventDraftMapping.optimisticEvent(from: draft, baseline: baseline))
        guard case .details(let content) = optimistic.content else {
            return XCTFail("Expected details content")
        }
        XCTAssertEqual(content.colorHex, "#E67C73")
        XCTAssertNil(content.color)
        XCTAssertEqual(EventColorSlotHex.eventColorHex(for: optimistic), "#E67C73")
    }

    func testOptimisticScheduleEditPreservesSlotColor() throws {
        let baseline = sampleTimedEvent(
            content: .details(
                EventContent_DetailsPayload(
                    color: .coral,
                    description: "",
                    kind: "details",
                    title: "Devotion"
                )
            ),
            recurrence: .occurrence(.init(kind: "occurrence", seriesId: EventId(rawValue: "bbbbbbbbbbbbbbbbbbbbbbbb")))
        )
        var draft = try XCTUnwrap(GridEventDraftFromEvent.editDraft(from: baseline))
        draft.schedule = DraftSchedule(
            start: baseline.scheduleStartDate().addingTimeInterval(3600),
            end: baseline.scheduleEndDate().addingTimeInterval(3600),
            kind: .timed
        )
        let optimistic = try XCTUnwrap(GridEventDraftMapping.optimisticEvent(from: draft, baseline: baseline))
        guard case .details(let content) = optimistic.content else {
            return XCTFail("Expected details content")
        }
        XCTAssertEqual(content.color, .coral)
        XCTAssertEqual(EventColorSlotHex.eventColorHex(for: optimistic), EventColorSlotHex.hex(for: .coral))
    }

    func testExplicitColorChangeAppliesNewSlot() throws {
        let baseline = sampleTimedEvent(
            content: .details(
                EventContent_DetailsPayload(
                    color: .coral,
                    description: "",
                    kind: "details",
                    title: "Devotion"
                )
            )
        )
        var draft = try XCTUnwrap(GridEventDraftFromEvent.editDraft(from: baseline))
        draft.color = .blue
        let optimistic = try XCTUnwrap(GridEventDraftMapping.optimisticEvent(from: draft, baseline: baseline))
        guard case .details(let content) = optimistic.content else {
            return XCTFail("Expected details content")
        }
        XCTAssertEqual(content.color, .blue)
        XCTAssertNil(content.colorHex)
    }

    private func sampleTimedEvent(content: EventContent, recurrence: EventRecurrence) -> Event {
        Event(
            calendarId: CalendarId(rawValue: "cal1cal1cal1cal1cal1cal1cal1"),
            content: content,
            createdAt: DateTime(rawValue: "2026-11-09T00:00:00.000Z"),
            id: EventId(rawValue: "aaaaaaaaaaaaaaaaaaaaaaaa"),
            recurrence: recurrence,
            schedule: .timed(
                EventSchedule_TimedPayload(
                    end: DateTime(rawValue: "2026-11-09T13:15:00.000Z"),
                    kind: "timed",
                    start: DateTime(rawValue: "2026-11-09T12:15:00.000Z"),
                    timeZone: IANATimeZone(rawValue: "America/Denver")
                )
            ),
            updatedAt: DateTime(rawValue: "2026-11-09T00:00:00.000Z")
        )
    }
}

private extension Event {
    func scheduleStartDate() -> Date {
        guard case .timed(let timed) = schedule else { return Date() }
        return CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue) ?? Date()
    }

    func scheduleEndDate() -> Date {
        guard case .timed(let timed) = schedule else { return Date() }
        return CompassDateParsing.parseInEffectiveTimeZone(timed.end.rawValue) ?? Date()
    }
}
