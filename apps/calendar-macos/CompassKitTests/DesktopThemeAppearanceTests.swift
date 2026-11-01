import CompassKit
import XCTest

final class DesktopThemeAppearanceTests: XCTestCase {
    func testAppIconFollowsSelectedTheme() {
        XCTAssertEqual(DesktopThemeAppearance(webTheme: "light-beach").appIconResourceName, "icon")
        XCTAssertEqual(DesktopThemeAppearance(webTheme: "dark-abyss").appIconResourceName, "icon-dark")
        XCTAssertEqual(DesktopThemeAppearance(webTheme: "unknown").appIconResourceName, "icon")
    }

    func testMapsWebThemes() {
        XCTAssertEqual(
            DesktopThemeAppearance(webTheme: "light-beach"),
            .lightBeach)
        XCTAssertEqual(
            DesktopThemeAppearance(webTheme: "dark-abyss"),
            .darkAbyss)
        XCTAssertEqual(
            DesktopThemeAppearance(webTheme: "unknown"),
            .lightBeach)
    }
}
