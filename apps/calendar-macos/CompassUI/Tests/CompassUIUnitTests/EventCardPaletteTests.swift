import AppKit
import CompassKit
import XCTest
@testable import CompassUI

@MainActor
final class EventCardPaletteTests: XCTestCase {
    func testCalendarColorStaysInAccentAndFocusWhileDefaultFillFollowsTheme() throws {
        let scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        for (theme, hex) in [(NativeWebTheme.lightBeach, "#454442"), (.darkAbyss, "#82A0B2")] {
            let view = try cardView(scenario: scenario, theme: theme)
            assertColor(view.layer?.backgroundColor, hex: hex)
            let accent = try XCTUnwrap(view.layer?.sublayers?.first { $0.frame.width == 3 })
            XCTAssertFalse(accent.isHidden)
            assertColor(accent.backgroundColor, hex: "#3b82f6")
            let ring = try XCTUnwrap(view.layer?.sublayers?.first { $0.borderWidth == 2 })
            assertColor(ring.borderColor, hex: "#3b82f6")
        }
    }

    func testExplicitEventColorDoesNotReplaceCalendarAccent() throws {
        var scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        scenario.timedEvents[0].colorHex = "#8e24aa"
        let view = try cardView(scenario: scenario, theme: .lightBeach)
        assertColor(view.layer?.backgroundColor, hex: "#8e24aa")
        let accent = try XCTUnwrap(view.layer?.sublayers?.first { $0.frame.width == 3 })
        assertColor(accent.backgroundColor, hex: "#3b82f6")
    }

    func testSingleCalendarDoesNotPaintAnIdentityStrip() throws {
        var scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        scenario.calendars = [scenario.calendars[0]]
        let view = try cardView(scenario: scenario, theme: .lightBeach)
        let accent = try XCTUnwrap(view.layer?.sublayers?.first { $0.frame.width == 3 })
        XCTAssertTrue(accent.isHidden)
    }

    func testHiddenOpacityAppliesToTheWholeCard() throws {
        let scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        let view = try cardView(scenario: scenario, theme: .lightBeach, eventId: "hidden-strip")
        XCTAssertEqual(view.layer?.opacity, 0.6)
        assertColor(view.layer?.backgroundColor, hex: "#454442")
    }

    func testDeckEdgesSeparateCardsInBothThemesAndClearWhenPooled() throws {
        let scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        let snapshot = GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: [400])
        var card = try XCTUnwrap(snapshot.cards.first { $0.eventId == "overlap-a" })
        XCTAssertTrue(card.isDeck)
        for theme in [NativeWebTheme.lightBeach, .darkAbyss] {
            let view = EventCardView(frame: .zero)
            view.apply(card: card, theme: theme, isFocused: false)
            let edge = try XCTUnwrap(view.layer?.sublayers?.first { $0.name == "deck-separation-edge" } as? CAShapeLayer)
            XCTAssertFalse(edge.isHidden)
            XCTAssertEqual(edge.lineWidth, 0.75)
            XCTAssertEqual(edge.strokeColor, NSColor(theme.backgroundColor).cgColor)
            XCTAssertEqual(view.layer?.shadowOpacity, 0.4)
            XCTAssertEqual(view.layer?.shadowOffset.height, -3)
            XCTAssertEqual(view.layer?.shadowPath?.boundingBox, view.bounds.insetBy(dx: 2, dy: 2))
            view.apply(card: card, theme: theme, isFocused: true)
            XCTAssertEqual(view.layer?.shadowOpacity, 0.55)
            XCTAssertEqual(view.layer?.shadowOffset.height, -6)
            XCTAssertEqual(view.layer?.shadowPath?.boundingBox, view.bounds.insetBy(dx: 3, dy: 3))
            card.isDeck = false
            view.apply(card: card, theme: theme, isFocused: false)
            XCTAssertTrue(edge.isHidden)
            XCTAssertEqual(view.layer?.shadowOpacity, 0)
            card.isDeck = true
        }
    }

    func testDeckMembershipRoundTripsAndOlderSnapshotsDefaultToNonDeck() throws {
        let scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        let snapshot = GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: [400])
        let card = try XCTUnwrap(snapshot.cards.first { $0.eventId == "overlap-a" })
        XCTAssertTrue(try JSONDecoder().decode(GridLayoutCardSnapshot.self, from: JSONEncoder().encode(card)).isDeck)
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(card)) as? [String: Any])
        legacy.removeValue(forKey: "isDeck")
        let decoded = try JSONDecoder().decode(GridLayoutCardSnapshot.self,
            from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertFalse(decoded.isDeck)
        XCTAssertFalse(try XCTUnwrap(snapshot.cards.first { $0.eventId == "hidden-strip" }).isDeck)
    }

    func testPastFillsMatchCanonicalWebColorsAndResetWhenPooled() throws {
        // Expected values come from web pastEventFill using tinycolor2.
        let pairs = [("#0b8043", "#0f683a"), ("#008e40", "#067438"), ("#454442", "#3a3a3a"),
            ("#82A0B2", "#7294a8"), ("#f6c5be", "#f3b1a8"), ("#e2f0cb", "#d7eab7")]
        let scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        var card = try XCTUnwrap(GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: [400]).cards.first)
        let view = EventCardView(frame: .zero)
        for (base, expected) in pairs {
            card.fillColorHex = base
            view.apply(card: card, theme: .lightBeach, isFocused: false, isPast: true)
            assertColor(view.layer?.backgroundColor, hex: expected)
            view.apply(card: card, theme: .lightBeach, isFocused: false)
            assertColor(view.layer?.backgroundColor, hex: base)
            card.isDraft = true
            view.apply(card: card, theme: .lightBeach, isFocused: false, isPast: true)
            assertColor(view.layer?.backgroundColor, hex: base)
            card.isDraft = false
        }
    }

    func testPastFillUsesEventEndAndNeverDimsDrafts() throws {
        let scenario = GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        let event = try XCTUnwrap(scenario.timedEvents.first)
        let end = try XCTUnwrap(CompassDateParsing.parseInEffectiveTimeZone(event.endDate))
        var state = TimeGridState(referenceNow: end, scenario: scenario)
        var card = try XCTUnwrap(GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: [400]).cards.first { $0.eventId == event.eventId })
        XCTAssertFalse(EventCardPastFill.isPast(card, state: state))
        state.referenceNow = end.addingTimeInterval(1)
        XCTAssertTrue(EventCardPastFill.isPast(card, state: state))
        card.isDraft = true
        XCTAssertFalse(EventCardPastFill.isPast(card, state: state))
    }

    private func cardView(scenario: GridLayoutScenario, theme: NativeWebTheme, eventId: String = "overlap-a") throws -> EventCardView {
        let snapshot = GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: [400])
        let card = try XCTUnwrap(snapshot.cards.first { $0.eventId == eventId })
        let view = EventCardView(frame: .zero)
        view.apply(card: card, theme: theme, isFocused: true)
        return view
    }

    private func assertColor(_ color: CGColor?, hex: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(color.flatMap { NSColor(cgColor: $0)?.usingColorSpace(.deviceRGB) },
            EventCardColorParser.nsColor(hex: hex)?.usingColorSpace(.deviceRGB), file: file, line: line)
    }
}
