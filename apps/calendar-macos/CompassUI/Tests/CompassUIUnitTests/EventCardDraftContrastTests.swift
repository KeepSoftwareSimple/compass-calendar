import AppKit
import CompassKit
import XCTest
@testable import CompassUI

@MainActor
final class EventCardDraftContrastTests: XCTestCase {
    func testDraftPlaceholderUsesSameForegroundAsTimeOnDefaultGrayFill() throws {
        let card = GridLayoutCardSnapshot(
            accessibilityIdentifier: "draft-contrast",
            eventId: "draft-contrast",
            fillColorHex: "#454442",
            frame: EventPosition(height: 60, left: 0, top: 0, width: 120),
            isHiddenStrip: false,
            kind: .timed,
            label: "Untitled event",
            zIndex: 1,
            isDraft: true,
            showsInlineTitleEditor: true
        )
        let view = EventCardView(frame: NSRect(x: 0, y: 0, width: 120, height: 60))
        view.apply(card: card, theme: .lightBeach, isFocused: true)
        let titleColor = try XCTUnwrap(view.compassTestingTitleTextColor)
        let timeColor = try XCTUnwrap(view.compassTestingTimeTextColor)
        let placeholderColor = try XCTUnwrap(view.compassTestingPlaceholderForeground)
        XCTAssertEqual(titleColor, timeColor)
        XCTAssertEqual(placeholderColor, titleColor)
        let fill = try XCTUnwrap(EventCardColorParser.nsColor(hex: "#454442"))
        XCTAssertGreaterThan(relativeLuminance(timeColor), relativeLuminance(fill))
    }

    func testAllDayDraftEditorMatchesTimeContrastInDarkTheme() throws {
        let card = GridLayoutCardSnapshot(
            accessibilityIdentifier: "draft-allday",
            eventId: "draft-allday",
            fillColorHex: "#454442",
            frame: EventPosition(height: 28, left: 0, top: 0, width: 200),
            isHiddenStrip: false,
            kind: .allDay,
            label: "Untitled event",
            zIndex: 1,
            isDraft: true,
            showsInlineTitleEditor: true
        )
        let view = EventCardView(frame: NSRect(x: 0, y: 0, width: 200, height: 28))
        view.apply(card: card, theme: .darkAbyss, isFocused: true)
        let titleColor = try XCTUnwrap(view.compassTestingTitleTextColor)
        let placeholderColor = try XCTUnwrap(view.compassTestingPlaceholderForeground)
        XCTAssertEqual(placeholderColor, titleColor)
    }

    private func relativeLuminance(_ color: NSColor) -> CGFloat {
        guard let rgb = color.usingColorSpace(.sRGB) else { return 0 }
        func linear(_ channel: CGFloat) -> CGFloat {
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(rgb.redComponent)
            + 0.7152 * linear(rgb.greenComponent)
            + 0.0722 * linear(rgb.blueComponent)
    }
}
