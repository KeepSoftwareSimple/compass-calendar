import Foundation

public struct GridLayoutDraftOverlay: Sendable, Hashable {
    public var calendarId: String?
    public var colorHex: String?
    public var eventId: String
    public var schedule: DraftSchedule
    public var showsInlineTitleEditor: Bool
    public var title: String

    public init(
        eventId: String,
        schedule: DraftSchedule,
        title: String,
        calendarId: String? = nil,
        colorHex: String? = nil,
        showsInlineTitleEditor: Bool = false
    ) {
        self.eventId = eventId
        self.schedule = schedule
        self.title = title
        self.calendarId = calendarId
        self.colorHex = colorHex
        self.showsInlineTitleEditor = showsInlineTitleEditor
    }
}
