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
    public var frame: EventPosition
    public var isHiddenStrip: Bool
    public var kind: GridLayoutCardKind
    public var label: String
    public var zIndex: Int

    public init(
        accessibilityIdentifier: String,
        eventId: String,
        fillColorHex: String?,
        frame: EventPosition,
        isHiddenStrip: Bool,
        kind: GridLayoutCardKind,
        label: String,
        zIndex: Int
    ) {
        self.accessibilityIdentifier = accessibilityIdentifier
        self.eventId = eventId
        self.fillColorHex = fillColorHex
        self.frame = frame
        self.isHiddenStrip = isHiddenStrip
        self.kind = kind
        self.label = label
        self.zIndex = zIndex
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
    public var title: String

    public init(
        calendarId: String? = nil,
        colorHex: String? = nil,
        endDate: String,
        eventId: String,
        startDate: String,
        title: String
    ) {
        self.calendarId = calendarId
        self.colorHex = colorHex
        self.endDate = endDate
        self.eventId = eventId
        self.startDate = startDate
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
    public var hiddenEventIds: Set<String>
    public var layoutMode: GridLayoutMode
    public var referenceNow: Date
    public var timedEvents: [GridLayoutTimedEventInput]
    public var visibleDateKeys: [String]

    public init(
        allDayEvents: [GridLayoutAllDayEventInput] = [],
        busyPeriods: [BusyPeriodInput] = [],
        calendars: [CompassCalendar] = [],
        hiddenEventIds: Set<String> = [],
        layoutMode: GridLayoutMode,
        referenceNow: Date,
        timedEvents: [GridLayoutTimedEventInput] = [],
        visibleDateKeys: [String]
    ) {
        self.allDayEvents = allDayEvents
        self.busyPeriods = busyPeriods
        self.calendars = calendars
        self.hiddenEventIds = hiddenEventIds
        self.layoutMode = layoutMode
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
