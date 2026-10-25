import Foundation

/// Web `timezone-mismatch.ts`: a pinned calendar zone that no longer matches
/// the device, unless the user chose to keep it for this device zone.
public enum TimezoneMismatch {
    public struct Copy: Equatable, Sendable {
        public let message: String
        public let switchLabel: String
        public let keepLabel: String
    }

    public static func shouldShow(pinned: String?, device: String, snoozedFor: String?) -> Bool {
        guard let pinned else { return false }
        // Brave and other browsers may spoof the device zone to UTC under fingerprinting.
        guard !TimeZoneFormatting.isUtcLikeTimeZone(device) else { return false }
        return pinned != device && snoozedFor != device
    }

    public static func copy(device: String, calendar: String, at date: Date = Date()) -> Copy {
        let deviceAbbr = TimeZoneFormatting.abbreviation(for: device, at: date)
        let calendarAbbr = TimeZoneFormatting.abbreviation(for: calendar, at: date)
        return Copy(
            message: "Your device is in \(TimeZoneFormatting.cityName(for: device)) time (\(deviceAbbr)) "
                + "but your calendar is showing \(TimeZoneFormatting.cityName(for: calendar)) time (\(calendarAbbr)).",
            switchLabel: "Switch to \(deviceAbbr)",
            keepLabel: "Keep \(calendarAbbr)")
    }
}
