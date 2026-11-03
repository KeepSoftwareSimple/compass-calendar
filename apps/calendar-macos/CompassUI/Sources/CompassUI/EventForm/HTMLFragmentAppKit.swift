import AppKit
import CompassKit

enum HTMLFragmentAppKit {
    static let listKindKey = NSAttributedString.Key("CompassDescriptionListKind")
    static let linkHintSlotKey = NSAttributedString.Key("CompassDescriptionLinkHintSlot")
    private static let verbatimKey = NSAttributedString.Key("CompassDescriptionVerbatim")
    static func attributedString(
        from document: HTMLFragmentDocument,
        textColor: NSColor,
        linkColor: NSColor,
        fontSize: CGFloat = 13
    ) -> NSAttributedString {
        let result = NSMutableAttributedString()
        let baseFont = NSFont.systemFont(ofSize: fontSize)
        for block in document.blocks {
            switch block {
            case .paragraph(let inlines):
                result.append(
                    inlineAttributedString(
                        inlines,
                        font: baseFont,
                        textColor: textColor,
                        linkColor: linkColor
                    )
                )
                result.append(NSAttributedString(string: "\n", attributes: [.font: baseFont, .foregroundColor: textColor]))
            case .unorderedList(let items):
                appendList(
                    items,
                    kind: "unordered",
                    to: result,
                    font: baseFont,
                    textColor: textColor,
                    linkColor: linkColor
                ) { _ in "• " }
            case .orderedList(let items):
                appendList(
                    items,
                    kind: "ordered",
                    to: result,
                    font: baseFont,
                    textColor: textColor,
                    linkColor: linkColor
                ) { index in "\(index + 1). " }
            case .verbatim(let html):
                result.append(
                    NSAttributedString(
                        string: html,
                        attributes: [
                            .font: NSFont.monospacedSystemFont(ofSize: fontSize - 1, weight: .regular),
                            .foregroundColor: textColor.withAlphaComponent(0.8),
                            verbatimKey: html,
                        ]
                    )
                )
                result.append(NSAttributedString(string: "\n", attributes: [.font: baseFont, .foregroundColor: textColor]))
            }
        }
        if result.string.hasSuffix("\n") {
            result.deleteCharacters(in: NSRange(location: result.length - 1, length: 1))
        }
        return result
    }

    static func document(
        from attributedString: NSAttributedString
    ) -> HTMLFragmentDocument {
        var blocks: [HTMLFragmentBlock] = []
        let text = attributedString.string
        guard !text.isEmpty else { return HTMLFragmentDocument(blocks: []) }
        var offset = 0
        var preservedVerbatimRanges: Set<Int> = []
        for line in text.components(separatedBy: "\n") {
            let range = NSRange(location: offset, length: (line as NSString).length)
            offset += range.length + 1
            if range.length > 0 {
                var effectiveRange = NSRange()
                if let html = attributedString.attribute(verbatimKey, at: range.location, effectiveRange: &effectiveRange) as? String,
                   attributedString.attributedSubstring(from: effectiveRange).string == html {
                    if preservedVerbatimRanges.insert(effectiveRange.location).inserted {
                        blocks.append(.verbatim(html))
                    }
                    continue
                }
                if let kind = attributedString.attribute(listKindKey, at: range.location, effectiveRange: nil) as? String {
                    let prefixLength = listPrefixLength(line, kind: kind)
                    let contentRange = NSRange(location: range.location + prefixLength, length: range.length - prefixLength)
                    let item = HTMLFragmentListItem(inlines: inlines(in: attributedString, range: contentRange))
                    switch (kind, blocks.last) {
                    case ("unordered", .unorderedList(let items)):
                        blocks[blocks.count - 1] = .unorderedList(items + [item])
                    case ("ordered", .orderedList(let items)):
                        blocks[blocks.count - 1] = .orderedList(items + [item])
                    case ("unordered", _): blocks.append(.unorderedList([item]))
                    default: blocks.append(.orderedList([item]))
                    }
                    continue
                }
            }
            blocks.append(.paragraph(inlines(in: attributedString, range: range)))
        }
        return HTMLFragmentDocument(blocks: blocks)
    }

    private static func appendList(
        _ items: [HTMLFragmentListItem],
        kind: String,
        to result: NSMutableAttributedString,
        font: NSFont,
        textColor: NSColor,
        linkColor: NSColor,
        prefix: (Int) -> String
    ) {
        for (index, item) in items.enumerated() {
            let start = result.length
            result.append(
                NSAttributedString(
                    string: prefix(index),
                    attributes: [.font: font, .foregroundColor: textColor]
                )
            )
            result.append(
                inlineAttributedString(
                    item.inlines,
                    font: font,
                    textColor: textColor,
                    linkColor: linkColor
                )
            )
            result.addAttribute(
                listKindKey,
                value: kind,
                range: NSRange(location: start, length: result.length - start)
            )
            result.append(
                NSAttributedString(
                    string: "\n",
                    attributes: [.font: font, .foregroundColor: textColor]
                )
            )
        }
    }

    static func listPrefixLength(_ line: String, kind: String?) -> Int {
        guard let kind else { return 0 }
        let pattern = kind == "unordered" ? "^• " : "^[0-9]+\\. "
        let range = (line as NSString).range(of: pattern, options: .regularExpression)
        return range.location == 0 ? range.length : 0
    }

    private static func inlineAttributedString(
        _ inlines: [HTMLFragmentInline],
        font: NSFont,
        textColor: NSColor,
        linkColor: NSColor,
        link: String? = nil
    ) -> NSAttributedString {
        let result = NSMutableAttributedString()
        for inline in inlines {
            switch inline {
            case .text(let value):
                var attrs: [NSAttributedString.Key: Any] = [
                    .font: font,
                    .foregroundColor: textColor,
                ]
                if let link, let url = URL(string: link) {
                    attrs[.link] = url
                    attrs[.toolTip] = link
                    attrs[.foregroundColor] = linkColor
                    attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
                }
                result.append(NSAttributedString(string: value, attributes: attrs))
            case .lineBreak:
                result.append(NSAttributedString(string: "\u{2028}", attributes: [.font: font, .foregroundColor: textColor]))
            case .bold(let children):
                let boldFont = NSFontManager.shared.convert(font, toHaveTrait: .boldFontMask)
                result.append(inlineAttributedString(children, font: boldFont, textColor: textColor, linkColor: linkColor, link: link))
            case .italic(let children):
                let italicFont = NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask)
                result.append(inlineAttributedString(children, font: italicFont, textColor: textColor, linkColor: linkColor, link: link))
            case .link(let href, let children):
                result.append(inlineAttributedString(children, font: font, textColor: linkColor, linkColor: linkColor, link: href))
            }
        }
        return result
    }

    private static func inlines(
        in attributedString: NSAttributedString,
        range: NSRange
    ) -> [HTMLFragmentInline] {
        var inlines: [HTMLFragmentInline] = []
        attributedString.enumerateAttributes(in: range, options: []) { attrs, subRange, _ in
            if attrs[.attachment] is DescriptionLinkHintSlotAttachment
                || attrs[linkHintSlotKey] != nil
            {
                return
            }
            let substring = (attributedString.string as NSString).substring(with: subRange)
            if substring.isEmpty || substring == "\u{FFFC}" { return }
            var children: [HTMLFragmentInline] = []
            for (index, piece) in substring.components(separatedBy: "\u{2028}").enumerated() {
                if index > 0 { children.append(.lineBreak) }
                if !piece.isEmpty { children.append(.text(piece)) }
            }
            let font = attrs[.font] as? NSFont ?? NSFont.systemFont(ofSize: 13)
            let traits = NSFontManager.shared.traits(of: font)
            if traits.contains(.italicFontMask) { children = [.italic(children)] }
            if traits.contains(.boldFontMask) { children = [.bold(children)] }
            if let value = attrs[.link] {
                let href = (value as? URL)?.absoluteString ?? (value as? String) ?? substring
                children = [.link(href: href, children: children)]
            }
            inlines.append(contentsOf: children)
        }
        return inlines
    }
}
