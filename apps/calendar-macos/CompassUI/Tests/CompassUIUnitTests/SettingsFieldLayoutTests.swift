import AppKit
import SwiftUI
import XCTest
@testable import CompassUI

@MainActor
final class SettingsFieldLayoutTests: XCTestCase {
    func testFieldLabelsAndTimezoneMatchRenderedWebHeightsInBothThemes() {
        for theme in [NativeWebTheme.lightBeach, .darkAbyss] {
            let label = NSHostingView(rootView: SettingsFieldLabel("Default timezone")
                .environment(\.nativeWebTheme, theme))
            XCTAssertEqual(label.fittingSize.height, 20, accuracy: 0.5)
            let control = NSHostingView(rootView: Text("Auto (UTC)")
                .settingsSelectChrome(minimumHeight: 30)
                .frame(width: 424)
                .environment(\.nativeWebTheme, theme))
            XCTAssertEqual(control.fittingSize.height, 30, accuracy: 0.5)
            XCTAssertEqual(control.fittingSize.width, 424, accuracy: 0.5)
        }
    }
}
