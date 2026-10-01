import CompassKit
import XCTest

final class DesktopThemeAppearanceTests: XCTestCase {
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
