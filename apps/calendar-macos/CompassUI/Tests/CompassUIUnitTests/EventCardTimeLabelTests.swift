import AppKit
import CompassKit
import XCTest
@testable import CompassUI

@MainActor
final class EventCardTimeLabelTests: XCTestCase {
    func testBerlinEventLabelsUsePinnedDenverGridZone() throws {
        let start = try XCTUnwrap(CompassDateParsing.parseGridDateTime(
            "2026-10-31T18:00:00.000Z", timeZoneIdentifier: "Europe/Berlin"))
        let end = try XCTUnwrap(CompassDateParsing.parseGridDateTime(
            "2026-10-31T19:30:00.000Z", timeZoneIdentifier: "Europe/Berlin"))
        let state = TimeGridState(
            referenceNow: start.addingTimeInterval(-3600),
            scenario: GridLayoutScenario(
                layoutMode: .week,
                referenceNow: start.addingTimeInterval(-3600),
                timedEvents: [
                    GridLayoutTimedEventInput(
                        endDate: "2026-10-31T19:30:00.000Z",
                        eventId: "ritual",
                        startDate: "2026-10-31T18:00:00.000Z",
                        timeZone: "Europe/Berlin",
                        title: "Monthly Ritual"),
                ],
                visibleDateKeys: ["2026-10-31"]),
            effectiveTimeZone: "America/Denver")
        var card = card()
        card.eventId = "ritual"
        card.label = "Monthly Ritual"
        XCTAssertEqual(EventCardTimeLabel.text(for: card, state: state), "12 - 1:30 PM")
        _ = end
    }

    func testRangesUseGridZoneAndOmitRepeatedMeridiem() throws {
        let start = try date("2026-10-20T15:00:00Z")
        let end = try date("2026-10-20T16:30:00Z")
        var state = state(start: start, end: end)
        XCTAssertEqual(EventCardTimeLabel.text(for: card(), state: state), "9 - 10:30 AM")
        state.effectiveTimeZone = "UTC"
        XCTAssertEqual(EventCardTimeLabel.text(for: card(), state: state), "3 - 4:30 PM")
        state = self.state(start: try date("2026-10-20T17:30:00Z"), end: try date("2026-10-20T18:00:00Z"))
        XCTAssertEqual(EventCardTimeLabel.text(for: card(), state: state), "11:30 AM - 12 PM")
    }

    func testPastSavedCardsOmitRangeButPastDraftsKeepIt() throws {
        let start = try date("2026-10-20T15:00:00Z")
        let end = try date("2026-10-20T16:00:00Z")
        var state = state(start: start, end: end)
        state.referenceNow = end.addingTimeInterval(1)
        XCTAssertNil(EventCardTimeLabel.text(for: card(), state: state))
        state.scenario.draftOverlay = GridLayoutDraftOverlay(eventId: "event",
            schedule: DraftSchedule(start: start, end: end, kind: .timed), title: "Draft")
        var draft = card()
        draft.isDraft = true
        XCTAssertEqual(EventCardTimeLabel.text(for: draft, state: state), "9 - 10 AM")
    }

    func testRenderedRangeFitsBelowWrappingTitleAndClearsWhenPooled() throws {
        let view = EventCardView(frame: .zero)
        var card = card()
        card.label = "A longer title that wraps across several lines of a tall event card"
        view.apply(card: card, theme: .lightBeach, isFocused: false, timeLabel: "9 - 10 AM")
        let fields = view.subviews.flatMap { [$0] + $0.subviews }.compactMap { $0 as? NSTextField }
        let time = try XCTUnwrap(fields.first { $0.stringValue == "9 - 10 AM" })
        let title = try XCTUnwrap(fields.first { $0.stringValue == card.label })
        XCTAssertFalse(time.isHidden)
        XCTAssertEqual(time.font?.pointSize, 11)
        XCTAssertEqual(time.alphaValue, 0.82, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(time.frame.minY, title.frame.maxY)
        XCTAssertLessThanOrEqual(time.frame.maxY, view.bounds.maxY)
        view.apply(card: card, theme: .darkAbyss, isFocused: false)
        XCTAssertTrue(time.isHidden)
        XCTAssertEqual(time.stringValue, "")
    }

    func testShortNarrowHiddenAndAllDayCardsDoNotShowRange() throws {
        let view = EventCardView(frame: .zero)
        for (width, height, hidden, kind) in [(89.0, 60.0, false, GridLayoutCardKind.timed),
            (120, 35, false, .timed), (120, 60, true, .timed), (120, 60, false, .allDay)] {
            var card = card(width: width, height: height)
            card.isHiddenStrip = hidden
            card.kind = kind
            view.apply(card: card, theme: .lightBeach, isFocused: false, timeLabel: "9 - 10 AM")
            let time = try XCTUnwrap(view.subviews.flatMap { [$0] + $0.subviews }.compactMap { $0 as? NSTextField }.first { $0.stringValue == "9 - 10 AM" })
            XCTAssertTrue(time.isHidden)
        }
    }

    func testTextClipsInsideCardWithoutClippingOutsideFocusRing() throws {
        let view = EventCardView(frame: .zero)
        view.apply(card: card(width: 30, height: 20), theme: .lightBeach, isFocused: true)
        let title = try XCTUnwrap(view.subviews.flatMap { [$0] + $0.subviews }
            .compactMap { $0 as? NSTextField }.first)
        let textContainer = try XCTUnwrap(title.superview)
        XCTAssertFalse(view.clipsToBounds)
        XCTAssertFalse(view.layer?.masksToBounds ?? true)
        XCTAssertTrue(textContainer !== view)
        XCTAssertTrue(textContainer.clipsToBounds)
        XCTAssertTrue(textContainer.layer?.masksToBounds ?? false)
        XCTAssertEqual(textContainer.frame, view.bounds)
    }

    func testTopClippedCardKeepsTitleInVisiblePartAndResetsWhenScrolledBack() throws {
        let view = EventCardView(frame: .zero)
        view.apply(card: card(height: 90), theme: .lightBeach, isFocused: false)
        let title = try XCTUnwrap(view.subviews.flatMap { [$0] + $0.subviews }
            .compactMap { $0 as? NSTextField }.first)
        view.updateVisibleContentRect(NSRect(x: 0, y: 55, width: 120, height: 35))
        XCTAssertGreaterThanOrEqual(title.frame.minY, 55)
        XCTAssertLessThanOrEqual(title.frame.maxY, 90)
        view.updateVisibleContentRect(view.bounds)
        XCTAssertLessThan(title.frame.minY, 10)
    }

    private func card(width: Double = 120, height: Double = 60) -> GridLayoutCardSnapshot {
        GridLayoutCardSnapshot(accessibilityIdentifier: "event", eventId: "event", fillColorHex: nil,
            frame: EventPosition(height: height, left: 0, top: 0, width: width),
            isHiddenStrip: false, kind: .timed, label: "Meeting", zIndex: 1)
    }

    private func date(_ iso: String) throws -> Date {
        try XCTUnwrap(ISO8601DateFormatter().date(from: iso))
    }

    private func state(start: Date, end: Date) -> TimeGridState {
        let now = start.addingTimeInterval(-3600)
        return TimeGridState(referenceNow: now,
            scenario: GridLayoutScenario(layoutMode: .week, referenceNow: now,
                timedEvents: [GridLayoutTimedEventInput(endDate: CompassDateParsing.formatLikeDayjs(end),
                    eventId: "event", startDate: CompassDateParsing.formatLikeDayjs(start), title: "Meeting")],
                visibleDateKeys: ["2026-10-20"]), effectiveTimeZone: "America/Denver")
    }
}
