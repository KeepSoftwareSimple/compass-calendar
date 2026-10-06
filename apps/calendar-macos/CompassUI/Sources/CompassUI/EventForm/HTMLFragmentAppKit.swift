import AppKit
import CompassKit

enum HTMLFragmentAppKit {
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
                    attributedInlines(
                        inlines,
                        baseFont: baseFont,
                        textColor: textColor,
                        linkColor: linkColor
                    )
                )
                result.append(NSAttributedString(string: "\n", attributes: [.font: baseFont, .foregroundColor: textColor]))
            case .unorderedList(let items):
                for item in items {
                    let prefix = "• "
                    result.append(
                        NSAttributedString(
                            string: prefix,
                            attributes: [.font: baseFont, .foregroundColor: textColor]
                        )
                    )
                    result.append(
                        attributedInlines(
                            item.inlines,
                            baseFont: baseFont,
                            textColor: textColor,
                            linkColor: linkColor
                        )
                    )
                    result.append(NSAttributedString(string: "\n", attributes: [.font: baseFont, .foregroundColor: textColor]))
                }
            case .orderedList(let items):
                for (index, item) in items.enumerated() {
                    let prefix = "\(index + 1). "
                    result.append(
                        NSAttributedString(
                            string: prefix,
                            attributes: [.font: baseFont, .foregroundColor: textColor]
                        )
                    )
                    result.append(
                        attributedInlines(
                            item.inlines,
                            baseFont: baseFont,
                            textColor: textColor,
                            linkColor: linkColor
                        )
                    )
                    result.append(NSAttributedString(string: "\n", attributes: [.font: baseFont, .foregroundColor: textColor]))
                }
            case .verbatim(let html):
                result.append(
                    NSAttributedString(
                        string: html,
                        attributes: [
                            .font: NSFont.monospacedSystemFont(ofSize: fontSize - 1, weight: .regular),
                            .foregroundColor: textColor.withAlphaComponent(0.8),
                        ]
                    )
                )
                result.append(NSAttributedString(string: "\n", attributes: [.font: baseFont, .foregroundColor: textColor]))
            }
        }
        while result.string.hasSuffix("\n") {
            result.deleteCharacters(in: NSRange(location: result.length - 1, length: 1))
        }
        return result
    }

    static func document(
        from attributedString: NSAttributedString,
        preservingVerbatimFrom original: HTMLFragmentDocument
    ) -> HTMLFragmentDocument {
        var blocks: [HTMLFragmentBlock] = []
        let text = attributedString.string
        let lines = text.components(separatedBy: "\n").filter { !$0.isEmpty }
        for line in lines {
            if let verbatim = original.blocks.compactMap({
                if case .verbatim(let html) = $0, line.contains(html.trimmingCharacters(in: .whitespacesAndNewlines)) {
                    return html
                }
                return nil
            }).first {
                blocks.append(.verbatim(verbatim))
                continue
            }
            let range = (text as NSString).range(of: line)
            let inlines = inlinesForLine(line, in: attributedString, range: range)
            if !inlines.isEmpty {
                blocks.append(.paragraph(inlines))
            }
        }
        for block in original.blocks {
            if case .verbatim(let html) = block,
                text.contains(html),
                !blocks.contains(.verbatim(html))
            {
                blocks.append(.verbatim(html))
            }
        }
        return HTMLFragmentDocument(blocks: blocks)
    }

    private static func attributedInlines(
        _ inlines: [HTMLFragmentInline],
        baseFont: NSFont,
        textColor: NSColor,
        linkColor: NSColor
    ) -> NSAttributedString {
        let result = NSMutableAttributedString()
        for inline in inlines {
            switch inline {
            case .text(let value):
                result.append(
                    NSAttributedString(
                        string: value,
                        attributes: [.font: baseFont, .foregroundColor: textColor]
                    )
                )
            case .lineBreak:
                result.append(
                    NSAttributedString(
                        string: "\n",
                        attributes: [.font: baseFont, .foregroundColor: textColor]
                    )
                )
            case .bold(let children):
                let boldFont = NSFontManager.shared.convert(baseFont, toHaveTrait: .boldFontMask)
                result.append(
                    inlineAttributedString(
                        children,
                        font: boldFont,
                        textColor: textColor,
                        linkColor: linkColor
                    )
                )
            case .italic(let children):
                let italicFont = NSFontManager.shared.convert(baseFont, toHaveTrait: .italicFontMask)
                result.append(
                    inlineAttributedString(
                        children,
                        font: italicFont,
                        textColor: textColor,
                        linkColor: linkColor
                    )
                )
            case .link(let href, let children):
                result.append(
                    inlineAttributedString(
                        children,
                        font: baseFont,
                        textColor: linkColor,
                        linkColor: linkColor,
                        link: href
                    )
                )
            }
        }
        return result
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
                    attrs[.foregroundColor] = linkColor
                    attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
                }
                result.append(NSAttributedString(string: value, attributes: attrs))
            case .lineBreak:
                result.append(NSAttributedString(string: "\n", attributes: [.font: font, .foregroundColor: textColor]))
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

    private static func inlinesForLine(
        _ line: String,
        in attributedString: NSAttributedString,
        range: NSRange
    ) -> [HTMLFragmentInline] {
        guard range.location != NSNotFound else {
            return line.isEmpty ? [] : [.text(line)]
        }
        var inlines: [HTMLFragmentInline] = []
        attributedString.enumerateAttributes(in: range, options: []) { attrs, subRange, _ in
            let substring = (attributedString.string as NSString).substring(with: subRange)
            if substring.isEmpty { return }
            if attrs[.link] != nil {
                let href = (attrs[.link] as? URL)?.absoluteString ?? substring
                inlines.append(.link(href: href, children: [.text(substring)]))
                return
            }
            let font = attrs[.font] as? NSFont ?? NSFont.systemFont(ofSize: 13)
            let traits = NSFontManager.shared.traits(of: font)
            if traits.contains(.boldFontMask) {
                inlines.append(.bold([.text(substring)]))
            } else if traits.contains(.italicFontMask) {
                inlines.append(.italic([.text(substring)]))
            } else {
                inlines.append(.text(substring))
            }
        }
        return inlines
    }
}
