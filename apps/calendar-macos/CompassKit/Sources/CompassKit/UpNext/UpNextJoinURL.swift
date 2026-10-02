import Foundation

public enum UpNextJoinURL {
    public static func resolve(event: Event, gridDescription: String? = nil) -> String? {
        if case .details(let details) = event.content {
            if let url = joinable(details.conference?.url) {
                return url
            }
            if let fromDescription = joinUrlFromDescription(details.description) {
                return fromDescription
            }
        }
        if let gridDescription, let fromGrid = joinUrlFromDescription(gridDescription) {
            return fromGrid
        }
        return nil
    }

    public static func joinUrlFromDescription(_ description: String?) -> String? {
        guard let description, !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        var seen = Set<String>()
        for candidate in urlsFromDescription(description) {
            if seen.contains(candidate) { continue }
            seen.insert(candidate)
            if let joinable = joinable(candidate) {
                return joinable
            }
        }
        return nil
    }

    private static func joinable(_ raw: String?) -> String? {
        guard let raw, VirtualMeetingURL.isVirtualMeeting(raw) else { return nil }
        return raw
    }

    private static func urlsFromDescription(_ description: String) -> [String] {
        var urls: [String] = []
        let hrefPattern = #"href=["'](https?://[^"']+)["']"#
        if let regex = try? NSRegularExpression(pattern: hrefPattern) {
            let range = NSRange(description.startIndex..., in: description)
            for match in regex.matches(in: description, range: range) {
                guard match.numberOfRanges > 1,
                      let urlRange = Range(match.range(at: 1), in: description)
                else { continue }
                if let normalized = normalizeHttpUrl(String(description[urlRange])) {
                    urls.append(normalized)
                }
            }
        }
        let plainPattern = #"https?://[^\s<>"']+"#
        if let regex = try? NSRegularExpression(pattern: plainPattern) {
            let range = NSRange(description.startIndex..., in: description)
            for match in regex.matches(in: description, range: range) {
                guard let urlRange = Range(match.range(at: 0), in: description) else { continue }
                let trimmed = trimTrailingPunctuation(String(description[urlRange]))
                if let normalized = normalizeHttpUrl(trimmed) {
                    urls.append(normalized)
                }
            }
        }
        return urls
    }

    private static func normalizeHttpUrl(_ raw: String) -> String? {
        guard let url = URL(string: raw) else { return nil }
        return url.absoluteString
    }

    private static func trimTrailingPunctuation(_ raw: String) -> String {
        var candidate = raw
        while let last = candidate.last, ",.)>".contains(last) {
            candidate.removeLast()
        }
        return candidate
    }
}
