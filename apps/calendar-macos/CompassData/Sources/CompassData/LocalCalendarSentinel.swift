import CompassKit
import Foundation
import Security

/// Client-generated local calendar id for anonymous mode (`local-calendar.sentinel.ts`).
public enum LocalCalendarSentinel {
    public static let storageKey = "compass.localCalendarId"

    public static func calendarId(repository: UserMetadataRepository) throws -> CalendarId {
        if let json = try repository.fetch(key: storageKey),
           let data = json.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(String.self, from: data)
        {
            return CalendarId(rawValue: decoded)
        }
        let generated = CalendarId(rawValue: generateObjectIdHex())
        try repository.upsert(key: storageKey, value: generated.rawValue)
        return generated
    }

    public static func synthesizeCalendar(id: CalendarId) -> CompassCalendar {
        CompassCalendar(
            access: .owner,
            accountEmail: nil,
            backgroundColor: "#ffffff",
            capabilities: CompassCalendarCapabilities(
                canInviteAttendees: false,
                canManage: false,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: false,
                canWrite: true,
                conferenceKinds: []
            ),
            conference: nil,
            createsGoogleMeet: nil,
            description: "",
            foregroundColor: "#000000",
            id: id.rawValue,
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Compass",
            provider: "local",
            timeZone: nil
        )
    }

    private static func generateObjectIdHex() -> String {
        var bytes = [UInt8](repeating: 0, count: 12)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}
