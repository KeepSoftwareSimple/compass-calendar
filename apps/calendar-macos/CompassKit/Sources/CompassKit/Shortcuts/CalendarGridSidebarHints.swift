import Foundation

/// Web `sidebar-hint-surface.ts`: calendar grid sidebar mode hints are off on Life.
public enum CalendarGridSidebarHints {
    public static func calendarGridModeHintsEligible(isLifeView: Bool) -> Bool {
        !isLifeView
    }
}
