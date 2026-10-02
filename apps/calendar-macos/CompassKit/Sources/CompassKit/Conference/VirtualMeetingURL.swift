import Foundation

public enum VirtualMeetingURL {
    private static let hostSuffixes = [
        "meet.google.com",
        "zoom.us",
        "teams.microsoft.com",
        "teams.live.com",
        "webex.com",
        "gotomeeting.com",
        "gotomeet.me",
        "whereby.com",
        "appear.in",
        "meet.jit.si",
        "bluejeans.com",
        "chime.aws",
        "join.skype.com",
        "daily.co",
    ]

    public static func isVirtualMeeting(_ raw: String) -> Bool {
        guard let hostname = hostname(for: raw) else { return false }
        return hostSuffixes.contains { suffix in
            hostname == suffix || hostname.hasSuffix(".\(suffix)")
        }
    }

    private static func hostname(for raw: String) -> String? {
        guard let url = URL(string: raw) else { return nil }
        return url.host?.lowercased()
    }
}
