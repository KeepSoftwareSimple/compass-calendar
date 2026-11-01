import Foundation

public enum GridLayoutMode: String, Codable, Sendable {
    case week
    case day
}

public struct GridLayoutSnapshotMetrics: Hashable, Sendable, Codable {
    public var allDayRowHeight: Double
    public var colWidths: [Double]
    public var hourHeight: Double
    public var marginLeft: Double
    public var timedGridHeight: Double

    public init(
        allDayRowHeight: Double,
        colWidths: [Double],
        hourHeight: Double,
        marginLeft: Double,
        timedGridHeight: Double
    ) {
        self.allDayRowHeight = allDayRowHeight
        self.colWidths = colWidths
        self.hourHeight = hourHeight
        self.marginLeft = marginLeft
        self.timedGridHeight = timedGridHeight
    }
}

public struct GridLayoutColumnSnapshot: Hashable, Sendable, Codable {
    public var accessibilityIdentifier: String
    public var key: String
    public var left: Double
    public var width: Double

    public init(accessibilityIdentifier: String, key: String, left: Double, width: Double) {
        self.accessibilityIdentifier = accessibilityIdentifier
        self.key = key
        self.left = left
        self.width = width
    }
}

public enum GridLayoutCardKind: String, Codable, Sendable {
    case allDay
    case busy
    case timed
}

public struct GridLayoutCardSnapshot: Hashable, Sendable, Codable {
    public var accessibilityIdentifier: String
    public var eventId: String
    public var fillColorHex: String?
    public var calendarAccentColorHex: String?
    public var focusColorHex: String?
    public var frame: EventPosition
    public var isDraft: Bool
    public var isDeck: Bool
    public var isHiddenStrip: Bool
    public var kind: GridLayoutCardKind
    public var label: String
    public var showsInlineTitleEditor: Bool
    public var zIndex: Int

    public init(
        accessibilityIdentifier: String,
        eventId: String,
        fillColorHex: String?,
        calendarAccentColorHex: String? = nil,
        focusColorHex: String? = nil,
        frame: EventPosition,
        isHiddenStrip: Bool,
        kind: GridLayoutCardKind,
        label: String,
        zIndex: Int,
        isDraft: Bool = false,
        isDeck: Bool = false,
        showsInlineTitleEditor: Bool = false
    ) {
        self.accessibilityIdentifier = accessibilityIdentifier
        self.eventId = eventId
        self.fillColorHex = fillColorHex
        self.calendarAccentColorHex = calendarAccentColorHex
        self.focusColorHex = focusColorHex
        self.frame = frame
        self.isHiddenStrip = isHiddenStrip
        self.kind = kind
        self.label = label
        self.zIndex = zIndex
        self.isDraft = isDraft
        self.isDeck = isDeck
        self.showsInlineTitleEditor = showsInlineTitleEditor
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessibilityIdentifier = try container.decode(String.self, forKey: .accessibilityIdentifier)
        eventId = try container.decode(String.self, forKey: .eventId)
        fillColorHex = try container.decodeIfPresent(String.self, forKey: .fillColorHex)
        calendarAccentColorHex = try container.decodeIfPresent(String.self, forKey: .calendarAccentColorHex)
        focusColorHex = try container.decodeIfPresent(String.self, forKey: .focusColorHex)
        frame = try container.decode(EventPosition.self, forKey: .frame)
        isHiddenStrip = try container.decode(Bool.self, forKey: .isHiddenStrip)
        kind = try container.decode(GridLayoutCardKind.self, forKey: .kind)
        label = try container.decode(String.self, forKey: .label)
        zIndex = try container.decode(Int.self, forKey: .zIndex)
        isDraft = try container.decodeIfPresent(Bool.self, forKey: .isDraft) ?? false
        isDeck = try container.decodeIfPresent(Bool.self, forKey: .isDeck) ?? false
        showsInlineTitleEditor =
            try container.decodeIfPresent(Bool.self, forKey: .showsInlineTitleEditor) ?? false
    }
}

public struct GridLayoutNowLineSnapshot: Hashable, Sendable, Codable {
    public var columnIndex: Int
    public var top: Double

    public init(columnIndex: Int, top: Double) {
        self.columnIndex = columnIndex
        self.top = top
    }
}

public struct GridLayoutSnapshot: Hashable, Sendable, Codable {
    public var cards: [GridLayoutCardSnapshot]
    public var columns: [GridLayoutColumnSnapshot]
    public var layoutMode: GridLayoutMode
    public var metrics: GridLayoutSnapshotMetrics
    public var nowLine: GridLayoutNowLineSnapshot?
    public var visibleDayCount: Int

    public init(
        cards: [GridLayoutCardSnapshot],
        columns: [GridLayoutColumnSnapshot],
        layoutMode: GridLayoutMode,
        metrics: GridLayoutSnapshotMetrics,
        nowLine: GridLayoutNowLineSnapshot?,
        visibleDayCount: Int
    ) {
        self.cards = cards
        self.columns = columns
        self.layoutMode = layoutMode
        self.metrics = metrics
        self.nowLine = nowLine
        self.visibleDayCount = visibleDayCount
    }
}

public struct GridLayoutTimedEventInput: Sendable {
    public var calendarId: String?
    public var colorHex: String?
    public var endDate: String
    public var eventId: String
    public var startDate: String
    public var timeZone: String?
    public var title: String

    public init(
        calendarId: String? = nil,
        colorHex: String? = nil,
        endDate: String,
        eventId: String,
        startDate: String,
        timeZone: String? = nil,
        title: String
    ) {
        self.calendarId = calendarId
        self.colorHex = colorHex
        self.endDate = endDate
        self.eventId = eventId
        self.startDate = startDate
        self.timeZone = timeZone
        self.title = title
    }
}

public struct GridLayoutAllDayEventInput: Sendable {
    public var calendarId: String?
    public var colorHex: String?
    public var endDate: String
    public var eventId: String
    public var row: Int?
    public var startDate: String
    public var title: String

    public init(
        calendarId: String? = nil,
        colorHex: String? = nil,
        endDate: String,
        eventId: String,
        row: Int? = nil,
        startDate: String,
        title: String
    ) {
        self.calendarId = calendarId
        self.colorHex = colorHex
        self.endDate = endDate
        self.eventId = eventId
        self.row = row
        self.startDate = startDate
        self.title = title
    }
}

public struct GridLayoutScenario: Sendable {
    public var allDayEvents: [GridLayoutAllDayEventInput]
    public var busyPeriods: [BusyPeriodInput]
    public var calendars: [CompassCalendar]
    public var defaultTargetCalendarId: String?
    public var draftOverlay: GridLayoutDraftOverlay?
    public var hiddenEventIds: Set<String>
    public var layoutMode: GridLayoutMode
    public var pinnedDayColumnCalendarIds: Set<String>
    public var referenceNow: Date
    public var timedEvents: [GridLayoutTimedEventInput]
    public var visibleDateKeys: [String]

    public init(
        allDayEvents: [GridLayoutAllDayEventInput] = [],
        busyPeriods: [BusyPeriodInput] = [],
        calendars: [CompassCalendar] = [],
        defaultTargetCalendarId: String? = nil,
        draftOverlay: GridLayoutDraftOverlay? = nil,
        hiddenEventIds: Set<String> = [],
        layoutMode: GridLayoutMode,
        pinnedDayColumnCalendarIds: Set<String> = [],
        referenceNow: Date,
        timedEvents: [GridLayoutTimedEventInput] = [],
        visibleDateKeys: [String]
    ) {
        self.allDayEvents = allDayEvents
        self.busyPeriods = busyPeriods
        self.calendars = calendars
        self.defaultTargetCalendarId = defaultTargetCalendarId
        self.draftOverlay = draftOverlay
        self.hiddenEventIds = hiddenEventIds
        self.layoutMode = layoutMode
        self.pinnedDayColumnCalendarIds = pinnedDayColumnCalendarIds
        self.referenceNow = referenceNow
        self.timedEvents = timedEvents
        self.visibleDateKeys = visibleDateKeys
    }
}

public enum GridLayoutAccessibility {
    public static func columnIdentifier(key: String) -> String {
        "compass-grid-column-\(key)"
    }

    public static func eventIdentifier(eventId: String) -> String {
        "compass-grid-event-\(eventId)"
    }
}
