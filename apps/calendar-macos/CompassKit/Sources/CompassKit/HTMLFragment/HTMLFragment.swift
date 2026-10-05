import Foundation

public enum HTMLFragmentInline: Equatable, Sendable {
    case text(String)
    case bold([HTMLFragmentInline])
    case italic([HTMLFragmentInline])
    case link(href: String, children: [HTMLFragmentInline])
    case lineBreak
}

public struct HTMLFragmentListItem: Equatable, Sendable {
    public var inlines: [HTMLFragmentInline]

    public init(inlines: [HTMLFragmentInline]) {
        self.inlines = inlines
    }
}

public enum HTMLFragmentBlock: Equatable, Sendable {
    case paragraph([HTMLFragmentInline])
    case unorderedList([HTMLFragmentListItem])
    case orderedList([HTMLFragmentListItem])
    case verbatim(String)
}

public struct HTMLFragmentDocument: Equatable, Sendable {
    public var blocks: [HTMLFragmentBlock]

    public init(blocks: [HTMLFragmentBlock]) {
        self.blocks = blocks
    }

    public static func parse(_ rawHtml: String) -> HTMLFragmentDocument {
        HTMLFragmentParser.parse(rawHtml)
    }

    public func serialize() -> String {
        HTMLFragmentSerializer.serialize(self)
    }

    public static func normalizeStoredDescription(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        let html = DescriptionPlainText.looksLikeHtml(trimmed)
            ? trimmed
            : DescriptionPlainText.plainTextToDescriptionHtml(trimmed)
        return HTMLFragmentSanitizer.sanitize(html)
    }

    public static func roundTrip(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        return parse(trimmed).serialize()
    }

    public var plainText: String {
        HTMLFragmentSerializer.plainText(from: self)
    }
}

enum HTMLFragmentSanitizer {
    private static let allowedTagPattern =
        #"(?i)</?(p|br|b|strong|i|em|ul|ol|li|a)(\s[^>]*)?>"#

    static func sanitize(_ html: String) -> String {
        var output = html
        output = output.replacingOccurrences(
            of: #"(?is)<script\b[^>]*>.*?</script>"#,
            with: "",
            options: .regularExpression
        )
        output = output.replacingOccurrences(
            of: #"\s(on\w+|style|class|target|rel)="[^"]*""#,
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        output = output.replacingOccurrences(
            of: #"\s(on\w+|style|class|target|rel)='[^']*'"#,
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        output = stripDisallowedTags(output)
        return output
    }

    private static func stripDisallowedTags(_ html: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"(?is)</?([a-z0-9]+)(?:\s[^>]*)?>"#) else {
            return html
        }
        let nsHtml = html as NSString
        var result = ""
        var cursor = 0
        let matches = regex.matches(in: html, range: NSRange(location: 0, length: nsHtml.length))
        for match in matches {
            let range = match.range
            if range.location > cursor {
                result += nsHtml.substring(with: NSRange(location: cursor, length: range.location - cursor))
            }
            let tagRange = match.range(at: 1)
            let tag = nsHtml.substring(with: tagRange).lowercased()
            let allowed = ["p", "br", "b", "strong", "i", "em", "ul", "ol", "li", "a"].contains(tag)
            if allowed {
                result += nsHtml.substring(with: range)
            }
            cursor = range.location + range.length
        }
        if cursor < nsHtml.length {
            result += nsHtml.substring(from: cursor)
        }
        return result
    }
}

enum HTMLFragmentParser {
    private struct BlockRange {
        let start: Int
        let end: Int
        let tag: String
    }

    static func parse(_ rawHtml: String) -> HTMLFragmentDocument {
        let html = rawHtml.trimmingCharacters(in: .whitespacesAndNewlines)
        if html.isEmpty {
            return HTMLFragmentDocument(blocks: [])
        }

        let ranges = findStructuredBlockRanges(in: html)
        if ranges.isEmpty {
            let sanitized = HTMLFragmentSanitizer.sanitize(html)
            if sanitized.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return HTMLFragmentDocument(blocks: [])
            }
            if sanitized == html {
                return HTMLFragmentDocument(blocks: parseStructuredBlocks(fromSanitized: sanitized))
            }
            return HTMLFragmentDocument(blocks: [.verbatim(html)])
        }

        var blocks: [HTMLFragmentBlock] = []
        var cursor = html.startIndex
        for range in ranges {
            if range.start > html.distance(from: html.startIndex, to: cursor) {
                let start = cursor
                let end = html.index(html.startIndex, offsetBy: range.start)
                let chunk = String(html[start..<end])
                if !chunk.isEmpty {
                    blocks.append(.verbatim(chunk))
                }
            }
            let sliceStart = html.index(html.startIndex, offsetBy: range.start)
            let sliceEnd = html.index(html.startIndex, offsetBy: range.end)
            let slice = String(html[sliceStart..<sliceEnd])
            blocks.append(contentsOf: parseStructuredBlocks(fromSanitized: HTMLFragmentSanitizer.sanitize(slice)))
            cursor = sliceEnd
        }
        if cursor < html.endIndex {
            blocks.append(.verbatim(String(html[cursor...])))
        }
        return HTMLFragmentDocument(blocks: blocks)
    }

    private static func findStructuredBlockRanges(in html: String) -> [BlockRange] {
        guard let regex = try? NSRegularExpression(
            pattern: #"(?is)<(p|ul|ol)(?:\s[^>]*)?>(.*?)</\1>"#
        ) else { return [] }
        let nsHtml = html as NSString
        var ranges: [BlockRange] = []
        for match in regex.matches(in: html, range: NSRange(location: 0, length: nsHtml.length)) {
            let tag = nsHtml.substring(with: match.range(at: 1)).lowercased()
            ranges.append(
                BlockRange(start: match.range.location, end: match.range.location + match.range.length, tag: tag)
            )
        }
        return ranges.sorted { $0.start < $1.start }
    }

    private static func parseStructuredBlocks(fromSanitized sanitized: String) -> [HTMLFragmentBlock] {
        let xmlReady = sanitized
            .replacingOccurrences(of: "<br>", with: "<br/>", options: .caseInsensitive)
            .replacingOccurrences(of: "&nbsp;", with: " ")
        let wrapped = "<body>\(xmlReady)</body>"
        guard let data = wrapped.data(using: .utf8) else { return [] }
        let parser = XMLParser(data: data)
        let delegate = HTMLFragmentXMLDelegate()
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        _ = parser.parse()
        return delegate.blocks
    }
}

private final class HTMLFragmentXMLDelegate: NSObject, XMLParserDelegate {
    var blocks: [HTMLFragmentBlock] = []
    private var inlineStack: [[HTMLFragmentInline]] = []
    private var listTagStack: [String] = []
    private var currentListItems: [[HTMLFragmentListItem]] = []
    private var pendingListItemInlines: [HTMLFragmentInline]?

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes attributeDict: [String: String] = [:]
    ) {
        let tag = elementName.lowercased()
        switch tag {
        case "body":
            break
        case "p":
            inlineStack.append([])
        case "ul", "ol":
            listTagStack.append(tag)
            currentListItems.append([])
        case "li":
            pendingListItemInlines = nil
            inlineStack.append([])
        case "br":
            appendInline(.lineBreak)
        case "strong", "b":
            inlineStack.append([])
        case "em", "i":
            inlineStack.append([])
        case "a":
            inlineStack.append([])
            if let href = attributeDict["href"], isSafeHttpHref(href) {
                linkHrefStack.append(href)
            } else {
                linkHrefStack.append(nil)
            }
        default:
            break
        }
    }

    private var linkHrefStack: [String?] = []

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?
    ) {
        let tag = elementName.lowercased()
        switch tag {
        case "body":
            break
        case "p":
            guard let inlines = inlineStack.popLast() else { return }
            if listTagStack.isEmpty {
                blocks.append(.paragraph(inlines))
            } else {
                pendingListItemInlines = inlines
            }
        case "ul", "ol":
            guard let tag = listTagStack.popLast(), let items = currentListItems.popLast() else { return }
            if tag == "ul" {
                blocks.append(.unorderedList(items))
            } else {
                blocks.append(.orderedList(items))
            }
        case "li":
            let inlines = pendingListItemInlines ?? inlineStack.popLast() ?? []
            pendingListItemInlines = nil
            _ = inlineStack.popLast()
            currentListItems[currentListItems.count - 1].append(HTMLFragmentListItem(inlines: inlines))
        case "strong", "b":
            guard let children = inlineStack.popLast() else { return }
            appendInline(.bold(children))
        case "em", "i":
            guard let children = inlineStack.popLast() else { return }
            appendInline(.italic(children))
        case "a":
            guard let children = inlineStack.popLast() else { return }
            let href = linkHrefStack.popLast() ?? nil
            if let href {
                appendInline(.link(href: href, children: children))
            } else {
                for child in children {
                    appendInline(child)
                }
            }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard !string.isEmpty else { return }
        appendInline(.text(string))
    }

    private func appendInline(_ inline: HTMLFragmentInline) {
        guard !inlineStack.isEmpty else { return }
        inlineStack[inlineStack.count - 1].append(inline)
    }
}

enum HTMLFragmentSerializer {
    static func serialize(_ document: HTMLFragmentDocument) -> String {
        if document.blocks.isEmpty { return "" }
        return document.blocks.map(serializeBlock).joined()
    }

    static func plainText(from document: HTMLFragmentDocument) -> String {
        var parts: [String] = []
        for block in document.blocks {
            switch block {
            case .paragraph(let inlines):
                parts.append(plainText(fromInlines: inlines))
            case .unorderedList(let items), .orderedList(let items):
                for item in items {
                    parts.append(plainText(fromInlines: item.inlines))
                }
            case .verbatim(let html):
                parts.append(html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression))
            }
        }
        return parts.joined(separator: "\n")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func plainText(fromInlines inlines: [HTMLFragmentInline]) -> String {
        inlines.map { inline in
            switch inline {
            case .text(let text):
                return text
            case .lineBreak:
                return "\n"
            case .bold(let children), .italic(let children), .link(_, let children):
                return plainText(fromInlines: children)
            }
        }.joined()
    }

    private static func serializeBlock(_ block: HTMLFragmentBlock) -> String {
        switch block {
        case .paragraph(let inlines):
            return "<p>\(serializeInlines(inlines))</p>"
        case .unorderedList(let items):
            return "<ul>\(items.map(serializeListItem).joined())</ul>"
        case .orderedList(let items):
            return "<ol>\(items.map(serializeListItem).joined())</ol>"
        case .verbatim(let html):
            return html
        }
    }

    private static func serializeListItem(_ item: HTMLFragmentListItem) -> String {
        "<li><p>\(serializeInlines(item.inlines))</p></li>"
    }

    private static func serializeInlines(_ inlines: [HTMLFragmentInline]) -> String {
        inlines.map(serializeInline).joined()
    }

    private static func serializeInline(_ inline: HTMLFragmentInline) -> String {
        switch inline {
        case .text(let text):
            return escapeHtml(text)
        case .bold(let children):
            return "<strong>\(serializeInlines(children))</strong>"
        case .italic(let children):
            return "<em>\(serializeInlines(children))</em>"
        case .link(let href, let children):
            return "<a href=\"\(escapeHtml(href))\">\(serializeInlines(children))</a>"
        case .lineBreak:
            return "<br>"
        }
    }

    private static func escapeHtml(_ text: String) -> String {
        text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

private func isSafeHttpHref(_ href: String) -> Bool {
    guard let url = URL(string: href), let scheme = url.scheme?.lowercased() else {
        return false
    }
    return scheme == "http" || scheme == "https"
}
