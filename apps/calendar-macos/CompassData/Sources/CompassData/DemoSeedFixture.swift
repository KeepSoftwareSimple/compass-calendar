import CompassKit
import Foundation

public struct DemoSeedFixture: Sendable {
    public struct Row: Sendable {
        public let id: String
        public let event: Event
        public let isDemo: Bool
    }

    public let referenceNow: Date
    public let timeZone: String
    public let calendarId: String
    public let events: [Row]

    public static func load(bundle: Bundle = CompassKitResourceBundle.resources) throws -> DemoSeedFixture {
        guard let url = bundle.url(
            forResource: "demo-seed",
            withExtension: "json",
            subdirectory: "Resources/Fixtures"
        ) ?? bundle.url(forResource: "demo-seed", withExtension: "json", subdirectory: "Fixtures")
        else {
            throw DemoSeedFixtureError.missingResource
        }
        let data = try Data(contentsOf: url)
        let document = try JSONDecoder().decode(DemoSeedDocument.self, from: data)
        guard let referenceNow = CompassDateParsing.parseInEffectiveTimeZone(document.referenceNow) else {
            throw DemoSeedFixtureError.invalidReferenceNow
        }
        return DemoSeedFixture(
            referenceNow: referenceNow,
            timeZone: document.timeZone,
            calendarId: document.calendarId,
            events: document.events.map { Row(id: $0.id, event: $0.event, isDemo: $0.isDemo) }
        )
    }

    public var demoEventIds: Set<String> {
        Set(events.filter(\.isDemo).map(\.id))
    }

    public func events(inRangeStart start: String, end: String) -> [Event] {
        events.map(\.event).filter { event in
            EventScheduleBounds.intersectsQueryRange(event: event, start: start, end: end)
        }
    }

    public func calendarListItem() -> CalendarListResponseCalendars {
        CalendarListResponseCalendars(
            access: .owner,
            accountEmail: nil,
            backgroundColor: "#3b82f6",
            capabilities: CompassCalendarCapabilities(
                canInviteAttendees: true,
                canManage: true,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: true,
                canWrite: true,
                conferenceKinds: []
            ),
            conference: nil,
            createsGoogleMeet: nil,
            description: "",
            foregroundColor: "#ffffff",
            id: calendarId,
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Work",
            provider: "local",
            timeZone: IANATimeZone(rawValue: timeZone)
        )
    }
}

public enum DemoSeedFixtureError: Error, Sendable {
    case missingResource
    case invalidReferenceNow
}

private struct DemoSeedDocument: Decodable {
    struct Row: Decodable {
        let id: String
        let event: Event
        let isDemo: Bool
    }

    let referenceNow: String
    let timeZone: String
    let calendarId: String
    let events: [Row]
}
