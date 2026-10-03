import Foundation

/// Launch arguments read by native UI for XCUITest only. Production launches omit these.
public enum UITestLaunchPolicy {
    /// When set, a grid tap that would show the scroll hint focuses this event id instead.
    public static var gridClickFocusEventId: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-COMPASS_UI_TEST_GRID_CLICK_FOCUS_EVENT"),
            index + 1 < args.count
        else { return nil }
        let value = args[index + 1]
        return value.isEmpty ? nil : value
    }
}
