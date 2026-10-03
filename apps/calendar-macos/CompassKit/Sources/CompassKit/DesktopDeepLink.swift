import Foundation

/// Recognized `compass://` links the shell may receive from the OS or relay to the web view.
public enum DesktopDeepLinkParser {
    private static let scheme = "compass"
    private static let authCallbackRegex: NSRegularExpression = {
        try! NSRegularExpression(pattern: "^compass://auth/([^/?#]+)/callback(\\?.*)?$")
    }()
    private static let connectCallbackRegex: NSRegularExpression = {
        try! NSRegularExpression(pattern: "^compass://connect/([^/?#]+)/callback(\\?.*)?$")
    }()
    private static let dayRegex: NSRegularExpression = {
        try! NSRegularExpression(pattern: "^compass://day/(\\d{4}-\\d{2}-\\d{2})/?$")
    }()
    private static let eventPrefix = "compass://event/"

    /// Returns the full URL string when the link is recognized; otherwise `nil` (ignore).
    public static func recognizedURLString(_ url: URL) -> String? {
        recognizedURLString(url.absoluteString)
    }

    public static func recognizedURLString(_ urlString: String) -> String? {
        guard let url = URL(string: urlString), url.scheme?.lowercased() == scheme else {
            return nil
        }
        let fullRange = NSRange(urlString.startIndex..., in: urlString)
        if authCallbackRegex.firstMatch(in: urlString, range: fullRange) != nil {
            return urlString
        }
        if connectCallbackRegex.firstMatch(in: urlString, range: fullRange) != nil {
            return urlString
        }
        if let day = parseDayDateString(from: urlString, range: fullRange) {
            return "compass://day/\(day)"
        }
        if let eventId = Self.parseEventId(from: urlString) {
            return "compass://event/\(eventId)"
        }
        return nil
    }

    /// Router path the hosted web app should open for a recognized deep link.
    public static func navigationPath(for urlString: String) -> String? {
        guard recognizedURLString(urlString) != nil else { return nil }
        let fullRange = NSRange(urlString.startIndex..., in: urlString)
        if let match = authCallbackRegex.firstMatch(in: urlString, range: fullRange),
           match.numberOfRanges > 1,
           let providerRange = Range(match.range(at: 1), in: urlString)
        {
            let provider = String(urlString[providerRange])
            var query = ""
            if match.numberOfRanges > 2, match.range(at: 2).location != NSNotFound,
               let queryRange = Range(match.range(at: 2), in: urlString)
            {
                query = String(urlString[queryRange])
            }
            return "/auth/\(provider)/callback\(query)"
        }
        if let day = parseDayDateString(from: urlString, range: fullRange) {
            return "/day/\(day)"
        }
        return nil
    }

    private static func parseDayDateString(from urlString: String, range: NSRange) -> String? {
        guard let match = dayRegex.firstMatch(in: urlString, range: range),
              match.numberOfRanges > 1,
              let dateRange = Range(match.range(at: 1), in: urlString)
        else {
            return nil
        }
        let dateString = String(urlString[dateRange])
        return isValidCalendarDay(dateString) ? dateString : nil
    }

    public static func parseEventId(from urlString: String) -> String? {
        guard urlString.hasPrefix(eventPrefix) else { return nil }
        let eventId = urlString.dropFirst(eventPrefix.count).trimmingCharacters(in: .whitespaces)
        return eventId.isEmpty ? nil : String(eventId)
    }

    private static func isValidCalendarDay(_ value: String) -> Bool {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }
}

/// Queues deep links until the hosted web app has finished its first load.
public struct DeepLinkInbox: Equatable, Sendable {
    public private(set) var webViewReady: Bool
    public private(set) var pending: [String]

    public init(webViewReady: Bool = false, pending: [String] = []) {
        self.webViewReady = webViewReady
        self.pending = pending
    }

    public enum ReceiveOutcome: Equatable, Sendable {
        case ignored
        case queued
        case deliverNow(String)
    }

    public mutating func receive(urlString: String) -> ReceiveOutcome {
        guard DesktopDeepLinkParser.recognizedURLString(urlString) != nil else {
            return .ignored
        }
        if webViewReady {
            return .deliverNow(urlString)
        }
        pending.append(urlString)
        return .queued
    }

    /// Marks the web view ready and returns any URLs queued while cold.
    public mutating func markWebViewReady() -> [String] {
        webViewReady = true
        let queued = pending
        pending = []
        return queued
    }
}
