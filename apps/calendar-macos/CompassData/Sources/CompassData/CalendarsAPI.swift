import CompassKit
import Foundation

public struct AvailabilityQuery: Sendable {
    public var calendarIds: [CalendarId]
    public var start: String
    public var end: String

    public init(calendarIds: [CalendarId], start: String, end: String) {
        self.calendarIds = calendarIds
        self.start = start
        self.end = end
    }
}

public struct CalendarsAPI: Sendable {
    private let client: CompassAPIClient

    init(client: CompassAPIClient) {
        self.client = client
    }

    public func list() async throws -> [CalendarListResponseCalendars] {
        let response: CalendarListResponse = try await client.sendDecodable(
            method: "GET",
            path: "calendars"
        )
        return response.calendars
    }

    public func availability(_ query: AvailabilityQuery) async throws -> AvailabilityResponse {
        let items = [
            URLQueryItem(name: "calendarIds", value: query.calendarIds.map(\.rawValue).joined(separator: ",")),
            URLQueryItem(name: "start", value: query.start),
            URLQueryItem(name: "end", value: query.end),
        ]
        return try await client.sendDecodable(
            method: "GET",
            path: "calendars/availability",
            queryItems: items
        )
    }
}
