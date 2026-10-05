import Foundation

private let htmlTagPattern = #"(?i)<(p|br|a|ul|ol|b|i|strong|em|div)\b"#

public enum DescriptionPlainText {
    public static func looksLikeHtml(_ value: String) -> Bool {
        value.range(of: htmlTagPattern, options: .regularExpression) != nil
    }

    public static func plainTextToDescriptionHtml(_ value: String) -> String {
        let blocks = splitPlainTextBlocks(value)
        return blocks.map { block in
            let trimmed = block.trimmingCharacters(in: .whitespacesAndNewlines)
            let lines = trimmed.components(separatedBy: "\n")
            let inner = lines.map { line in
                linkifyUrls(escapeHtml(line))
            }.joined(separator: "<br>")
            return "<p>\(inner)</p>"
        }.joined()
    }

    private static func splitPlainTextBlocks(_ value: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: "\n\\s*\n") else {
            return value.isEmpty ? [] : [value]
        }
        let nsValue = value as NSString
        var blocks: [String] = []
        var cursor = 0
        for match in regex.matches(in: value, range: NSRange(location: 0, length: nsValue.length)) {
            if match.range.location > cursor {
                blocks.append(
                    nsValue.substring(
                        with: NSRange(location: cursor, length: match.range.location - cursor)
                    )
                )
            }
            cursor = match.range.location + match.range.length
        }
        if cursor < nsValue.length {
            blocks.append(nsValue.substring(from: cursor))
        }
        return blocks.isEmpty ? [value] : blocks
    }

    private static func escapeHtml(_ text: String) -> String {
        text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func linkifyUrls(_ text: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"https?://[^\s]+"#) else {
            return text
        }
        let nsText = text as NSString
        let range = NSRange(location: 0, length: nsText.length)
        var result = ""
        var cursor = 0
        for match in regex.matches(in: text, range: range) {
            let matchRange = match.range
            if matchRange.location > cursor {
                result += nsText.substring(with: NSRange(location: cursor, length: matchRange.location - cursor))
            }
            var url = nsText.substring(with: matchRange)
            var suffix = ""
            while let last = url.last, ".,)>".contains(last) {
                suffix = String(last) + suffix
                url.removeLast()
            }
            if url.isEmpty {
                result += nsText.substring(with: matchRange)
            } else {
                result += "<a href=\"\(url)\">\(url)</a>\(suffix)"
            }
            cursor = matchRange.location + matchRange.length
        }
        if cursor < nsText.length {
            result += nsText.substring(from: cursor)
        }
        return result
    }
}
