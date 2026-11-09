import CompassKit
import XCTest

final class GridEventFocusChromeTests: XCTestCase {
    private let defaultFillLight = "#454442"
    private let defaultFillDark = "#82A0B2"

    func testCalendarGrayFallsBackOnDefaultLightFill() {
        let indicator = GridEventFocusChrome.resolveIndicatorHex(
            focusHex: "#616161",
            fillHex: defaultFillLight,
            theme: .lightBeach
        )
        XCTAssertNotEqual(indicator.uppercased(), "#616161")
        XCTAssertEqual(
            indicator.uppercased(),
            GridEventFocusChrome.contrastTextHex(on: defaultFillLight, theme: .lightBeach).uppercased()
        )
        XCTAssertGreaterThanOrEqual(
            GridEventFocusChrome.contrastRatio(indicator, defaultFillLight),
            GridEventFocusChrome.minIndicatorContrast
        )
    }

    func testCalendarGreenStaysOnDefaultFillWhenContrastPasses() {
        let indicator = GridEventFocusChrome.resolveIndicatorHex(
            focusHex: "#22c55e",
            fillHex: defaultFillLight,
            theme: .lightBeach
        )
        XCTAssertEqual(indicator.uppercased(), "#22C55E")
    }

    func testDarkAbyssDefaultFillMeetsContrastFloor() {
        let indicator = GridEventFocusChrome.resolveIndicatorHex(
            focusHex: "#616161",
            fillHex: defaultFillDark,
            theme: .darkAbyss
        )
        XCTAssertGreaterThanOrEqual(
            GridEventFocusChrome.contrastRatio(indicator, defaultFillDark),
            GridEventFocusChrome.minIndicatorContrast
        )
    }

    func testProviderHexOnMatchingFillUsesContrastText() {
        let fill = "#8e24aa"
        let indicator = GridEventFocusChrome.resolveIndicatorHex(
            focusHex: fill,
            fillHex: fill,
            theme: .lightBeach
        )
        XCTAssertGreaterThanOrEqual(
            GridEventFocusChrome.contrastRatio(indicator, fill),
            GridEventFocusChrome.minIndicatorContrast
        )
    }

    func testEveryColorSlotContrastsOnItsOwnFill() throws {
        for slot in ColorEnum.allCases {
            let fill = EventColorSlotHex.hex(for: slot)
            let indicator = GridEventFocusChrome.resolveIndicatorHex(
                focusHex: fill,
                fillHex: fill,
                theme: .lightBeach
            )
            XCTAssertGreaterThanOrEqual(
                GridEventFocusChrome.contrastRatio(indicator, fill),
                GridEventFocusChrome.minIndicatorContrast,
                "slot \(slot)"
            )
        }
    }
}
