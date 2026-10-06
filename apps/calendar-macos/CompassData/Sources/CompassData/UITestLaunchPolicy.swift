import Foundation

/// Launch arguments read by native UI for XCUITest only. Production launches omit these.
public enum UITestLaunchPolicy {
    /// When set, focuses this grid event once the demo fixture layout is ready (no pointer hint).
    public static var initialGridFocusEventId: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT"),
            index + 1 < args.count
        else { return nil }
        let value = args[index + 1]
        return value.isEmpty ? nil : value
    }

    /// When set, a grid tap that would show the scroll hint focuses this event id instead.
    public static var gridClickFocusEventId: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-COMPASS_UI_TEST_GRID_CLICK_FOCUS_EVENT"),
            index + 1 < args.count
        else { return nil }
        let value = args[index + 1]
        return value.isEmpty ? nil : value
    }

    /// Opens the native edit form for the initially focused grid event once layout is ready.
    public static var openFocusedEventFormAfterInitialGridFocus: Bool {
        ProcessInfo.processInfo.arguments.contains("-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM")
    }

    /// Full week column count so demo fixture events stay in the focus layout during XCUITest.
    public static var pinnedWeekGridTrackWidth: CGFloat? {
        if initialGridFocusEventId != nil
            || openFocusedEventFormAfterInitialGridFocus
            || ProcessInfo.processInfo.arguments.contains("-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK")
        {
            return 1030
        }
        return nil
    }

    /// Keeps the native quick-add panel key so Debug menu XCUITests can reach the field.
    public static var stickyQuickAddPanel: Bool {
        ProcessInfo.processInfo.arguments.contains("-COMPASS_UI_TEST_STICKY_QUICK_ADD_PANEL")
    }

    /// Confirms recurring save scope in-process (keyboard scope digits are flaky in CI).
    public static var autoConfirmRecurrenceScopeOnSave: Bool {
        ProcessInfo.processInfo.arguments.contains("-COMPASS_UI_TEST_AUTO_CONFIRM_RECURRENCE_SCOPE_SAVE")
    }

    /// Seeds the open event form title (XCUITest typing is flaky for recurring edits in CI).
    public static var presetEventFormTitle: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-COMPASS_UI_TEST_EVENT_FORM_TITLE"),
            index + 1 < args.count
        else { return nil }
        let value = args[index + 1]
        return value.isEmpty ? nil : value
    }

    /// Appends a recurring occurrence row to the demo seed for recurrence-scope XCUITest.
    public static var appendDemoOccurrenceForUITest: Bool {
        ProcessInfo.processInfo.arguments.contains("-COMPASS_UI_TEST_APPEND_DEMO_OCCURRENCE")
    }
}
