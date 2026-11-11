import AppKit
import CompassKit
import XCTest
@testable import CompassUI

/// Web `DayLabels`: Mod-hold shows ⇧su / ⇧m on every column. Event-jump mode
/// shows bare lowercase except macOS view collisions (`w` → week view): Wed is ⇧w.
@MainActor
final class TimeGridDayJumpPrefixTests: XCTestCase {
    private let dayKeys = ["2026-05-17", "2026-05-20"]

    func testWeekHeadersShowWeekdayNamesByDefault() {
        let view = render(showDayJumpPrefixes: false)
        XCTAssertEqual(headerTexts(in: view, dayKey: "2026-05-17"), ["17 Sun"])
    }

    func testWeekHeadersShowShiftPrefixedChipsWhileModIsHeld() {
        let view = render(showDayJumpPrefixes: true)
        let sunday = headerTexts(in: view, dayKey: "2026-05-17")
        let wednesday = headerTexts(in: view, dayKey: "2026-05-20")
        XCTAssertTrue(sunday.contains("⇧su"), "Sunday header texts: \(sunday)")
        XCTAssertTrue(wednesday.contains("⇧w"), "Wednesday header texts: \(wednesday)")
        XCTAssertFalse(sunday.contains("Sun"), "Sunday header texts: \(sunday)")
    }

    func testEventJumpModeShowsBarePrefixesExceptWednesday() {
        let view = render(showDayJumpPrefixes: true, dayJumpUseShiftPrefix: false)
        let sunday = headerTexts(in: view, dayKey: "2026-05-17")
        let wednesday = headerTexts(in: view, dayKey: "2026-05-20")
        XCTAssertTrue(sunday.contains("su"), "Sunday header texts: \(sunday)")
        XCTAssertFalse(sunday.contains("⇧"), "Sunday header texts: \(sunday)")
        XCTAssertTrue(wednesday.contains("⇧w"), "Wednesday header texts: \(wednesday)")
    }

    private func render(showDayJumpPrefixes: Bool, dayJumpUseShiftPrefix: Bool = true) -> TimeGridView {
        // Header texts are set while rendering, so pinning the shared zone
        // for the render is enough; earlier suites change it.
        let savedZone = EffectiveTimeZone.identifier
        defer { EffectiveTimeZone.identifier = savedZone }
        EffectiveTimeZone.identifier = "UTC"
        let state = TimeGridState(
            layoutMode: .week,
            scenario: GridLayoutSnapshotFixtures.parityScenario(layoutMode: .week, visibleDateKeys: dayKeys),
            showDayJumpPrefixes: showDayJumpPrefixes,
            dayJumpUseShiftPrefix: dayJumpUseShiftPrefix
        )
        let view = TimeGridView(state: state, theme: .lightBeach)
        view.frame = NSRect(x: 0, y: 0, width: 800, height: 600)
        view.layoutSubtreeIfNeeded()
        return view
    }

    private func headerTexts(in view: NSView, dayKey: String) -> [String] {
        guard let header = firstView(in: view, identifier: dayKey) else { return [] }
        return ([header] + allSubviews(of: header)).compactMap { subview in
            guard let field = subview as? NSTextField, !field.isHidden else { return nil }
            return field.stringValue
        }
    }

    private func firstView(in view: NSView, identifier: String) -> NSView? {
        if view.identifier?.rawValue == identifier { return view }
        return view.subviews.compactMap { firstView(in: $0, identifier: identifier) }.first
    }

    private func allSubviews(of view: NSView) -> [NSView] {
        view.subviews + view.subviews.flatMap { allSubviews(of: $0) }
    }
}
