// Mirrors `apps/calendar-web/src/views/Week/hooks/useWeek.ts`,
// `apps/calendar-web/src/timezone/effective-timezone.store.ts`, and
// `apps/calendar-web/src/timezone/time-travel.store.ts`.

import CompassKit
import Foundation

public enum CalendarGridView: String, Sendable, Hashable, CaseIterable {
    case day
    case week
    case life
}

@MainActor
@Observable
public final class ViewStore {
    public var view: CalendarGridView
    public var anchorDate: Date
    public var visibleDayCount: Int
    public private(set) var pinnedTimeZone: String?
    public private(set) var browserTimeZone: String
    public private(set) var timeTravelTimeZone: String?

    public init(
        view: CalendarGridView = .week,
        anchorDate: Date = Date(),
        visibleDayCount: Int = CalendarWindowMath.weekDayCount,
        pinnedTimeZone: String? = nil,
        browserTimeZone: String = TimeZone.current.identifier,
        timeTravelTimeZone: String? = nil
    ) {
        self.view = view
        self.anchorDate = anchorDate
        self.visibleDayCount = min(max(visibleDayCount, 1), CalendarWindowMath.weekDayCount)
        self.pinnedTimeZone = pinnedTimeZone
        self.browserTimeZone = browserTimeZone
        self.timeTravelTimeZone = timeTravelTimeZone
        syncEffectiveTimeZone()
    }

    public var effectiveTimeZone: String {
        pinnedTimeZone ?? browserTimeZone
    }

    public func setAnchorDate(_ date: Date) {
        anchorDate = date
    }

    public func setVisibleDayCount(_ count: Int) {
        visibleDayCount = min(max(count, 1), CalendarWindowMath.weekDayCount)
    }

    @discardableResult
    public func setPinnedTimeZone(_ timeZone: String?) -> Bool {
        guard timeZone == nil || TimeZone(identifier: timeZone!) != nil else {
            return false
        }
        pinnedTimeZone = timeZone
        syncEffectiveTimeZone()
        return true
    }

    public func refreshBrowserTimeZone(_ timeZone: String = TimeZone.current.identifier) {
        browserTimeZone = timeZone
        if pinnedTimeZone == nil {
            syncEffectiveTimeZone()
        }
    }

    @discardableResult
    public func setTimeTravelTimeZone(_ timeZone: String?) -> Bool {
        guard timeZone == nil || TimeZone(identifier: timeZone!) != nil else {
            return false
        }
        timeTravelTimeZone = timeZone
        return true
    }

    private func syncEffectiveTimeZone() {
        EffectiveTimeZone.identifier = effectiveTimeZone
    }
}
