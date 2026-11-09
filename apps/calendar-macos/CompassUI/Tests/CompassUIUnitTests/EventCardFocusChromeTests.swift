import AppKit
import CompassKit
import XCTest
@testable import CompassUI

@MainActor
final class EventCardFocusChromeTests: XCTestCase {
    func testSidebarRingUsesContrastOnDefaultFillWithCalendarGray() throws {
        var scenario = GridLayoutSnapshotFixtures.parityScenario(
            layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        scenario.timedEvents[0].colorHex = nil
        let snapshot = GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: [400])
        var card = try XCTUnwrap(snapshot.cards.first { $0.eventId == scenario.timedEvents[0].eventId })
        card.fillColorHex = "#454442"
        card.focusColorHex = "#616161"
        let view = EventCardView(frame: NSRect(x: 0, y: 0, width: 120, height: 80))
        view.apply(card: card, theme: .lightBeach, isFocused: false, isSidebarEditing: true)
        let ring = try XCTUnwrap(sublayer(named: EventCardChromeLayerName.focusRing, in: view))
        XCTAssertFalse(ring.isHidden)
        let expected = GridEventFocusChrome.resolveIndicatorHex(
            focusHex: "#616161", fillHex: "#454442", theme: .lightBeach)
        assertBorderColor(ring, equalsHex: expected)
        XCTAssertGreaterThanOrEqual(
            GridEventFocusChrome.contrastRatio(expected, "#454442"),
            GridEventFocusChrome.minIndicatorContrast)
    }

    func testStartAndEndEdgeBarsOnDefaultFillLightAndDark() throws {
        try assertEdgeBar(edge: .startDate, theme: .lightBeach, fill: "#454442")
        try assertEdgeBar(edge: .endDate, theme: .lightBeach, fill: "#454442")
        try assertEdgeBar(edge: .startDate, theme: .darkAbyss, fill: "#82A0B2")
        try assertEdgeBar(edge: .endDate, theme: .darkAbyss, fill: "#82A0B2")
    }

    func testDraftWithProviderHexKeepsReadableEdgeFocus() throws {
        var scenario = GridLayoutSnapshotFixtures.parityScenario(
            layoutMode: .week, visibleDateKeys: ["2026-05-20"])
        let snapshot = GridLayoutSnapshotBuilder.build(scenario: scenario, colWidths: [400])
        var card = try XCTUnwrap(snapshot.cards.first { $0.eventId == "overlap-a" })
        card.isDraft = true
        card.fillColorHex = "#c4b5fd"
        card.focusColorHex = "#3b82f6"
        let view = EventCardView(frame: NSRect(x: 0, y: 0, width: 120, height: 80))
        view.apply(card: card, theme: .lightBeach, isFocused: true, focusedEdge: .startDate)
        let ring = try XCTUnwrap(sublayer(named: EventCardChromeLayerName.focusRing, in: view))
        XCTAssertTrue(ring.isHidden)
        let edge = try XCTUnwrap(sublayer(named: EventCardChromeLayerName.edgeFocus, in: view))
        let gutter = try XCTUnwrap(sublayer(named: EventCardChromeLayerName.edgeGutter, in: view))
        XCTAssertFalse(edge.isHidden)
        XCTAssertFalse(gutter.isHidden)
        let expected = GridEventFocusChrome.resolveIndicatorHex(
            focusHex: "#3b82f6", fillHex: "#c4b5fd", theme: .lightBeach)
        assertBackgroundColor(edge, equalsHex: expected)
        XCTAssertGreaterThanOrEqual(
            GridEventFocusChrome.contrastRatio(expected, "#c4b5fd"),
            GridEventFocusChrome.minIndicatorContrast)
    }

    private func assertEdgeBar(
        edge: EventEdge,
        theme: NativeWebTheme,
        fill: String
    ) throws {
        let card = GridLayoutCardSnapshot(
            accessibilityIdentifier: "test",
            eventId: "edge-test",
            fillColorHex: fill,
            focusColorHex: "#616161",
            frame: EventPosition(height: 80, left: 0, top: 0, width: 120),
            isHiddenStrip: false,
            kind: .timed,
            label: "Test",
            zIndex: 1
        )
        let view = EventCardView(frame: NSRect(x: 0, y: 0, width: 120, height: 80))
        view.apply(card: card, theme: theme, isFocused: true, focusedEdge: edge)
        view.layoutSubtreeIfNeeded()
        let ring = try XCTUnwrap(sublayer(named: EventCardChromeLayerName.focusRing, in: view))
        XCTAssertTrue(ring.isHidden)
        let edgeLayer = try XCTUnwrap(sublayer(named: EventCardChromeLayerName.edgeFocus, in: view))
        let gutter = try XCTUnwrap(sublayer(named: EventCardChromeLayerName.edgeGutter, in: view))
        XCTAssertFalse(edgeLayer.isHidden)
        XCTAssertFalse(gutter.isHidden)
        let expected = GridEventFocusChrome.resolveIndicatorHex(
            focusHex: "#616161",
            fillHex: fill,
            theme: theme.compassThemeName
        )
        assertBackgroundColor(edgeLayer, equalsHex: expected)
        XCTAssertGreaterThanOrEqual(
            GridEventFocusChrome.contrastRatio(expected, fill),
            GridEventFocusChrome.minIndicatorContrast)
    }

    private func sublayer(named name: String, in view: EventCardView) -> CALayer? {
        view.layer?.sublayers?.first { $0.name == name }
    }

    private func assertBorderColor(_ layer: CALayer, equalsHex hex: String, file: StaticString = #filePath, line: UInt = #line) {
        let color = layer.borderColor.flatMap { NSColor(cgColor: $0)?.usingColorSpace(.deviceRGB) }
        let expected = EventCardColorParser.nsColor(hex: hex)?.usingColorSpace(.deviceRGB)
        XCTAssertEqual(color, expected, file: file, line: line)
    }

    private func assertBackgroundColor(_ layer: CALayer, equalsHex hex: String, file: StaticString = #filePath, line: UInt = #line) {
        let color = layer.backgroundColor.flatMap { NSColor(cgColor: $0)?.usingColorSpace(.deviceRGB) }
        let expected = EventCardColorParser.nsColor(hex: hex)?.usingColorSpace(.deviceRGB)
        XCTAssertEqual(color, expected, file: file, line: line)
    }
}
