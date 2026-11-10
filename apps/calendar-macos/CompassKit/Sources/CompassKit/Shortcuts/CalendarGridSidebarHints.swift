import Foundation

/// Web `sidebar-hint-surface.ts`: which sidebar hints belong on the grid vs Life.
public enum CalendarGridSidebarHints {
    public static func isLifeSpaPath(_ path: String) -> Bool {
        let normalized = normalize(path)
        return normalized == "/life" || normalized.hasPrefix("/life/")
    }

    public static func isCalendarGridSpaPath(_ path: String) -> Bool {
        let normalized = normalize(path)
        if normalized == "/" { return true }
        if normalized == "/week" || normalized.hasPrefix("/week/") { return true }
        if normalized == "/day" || normalized.hasPrefix("/day/") { return true }
        return false
    }

    public static func calendarGridModeHintsEligible(view: CalendarGridView) -> Bool {
        view != .life
    }

    private static func normalize(_ path: String) -> String {
        var trimmed = path.split(separator: "?").first.map(String.init) ?? path
        while trimmed.hasSuffix("/"), trimmed.count > 1 {
            trimmed.removeLast()
        }
        return trimmed.isEmpty ? "/" : trimmed
    }
}
