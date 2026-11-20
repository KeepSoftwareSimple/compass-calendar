// The editor serializes list items as `<li><p>text</p></li>`. Calendar
// providers rewrite that markup on save (paragraphs become line breaks), so
// the item comes back as `<li><br>text</li>` and renders as an empty bullet
// with the text on the next line. Emit `<li>text</li>` on save, and drop
// leading/trailing breaks inside list items on load to repair descriptions
// that were already rewritten.
export const compactListItemHtml = (html: string): string =>
  html
    .replace(/<li>(?:\s|<br\s*\/?>|<p>\s*<\/p>)+/gi, "<li>")
    .replace(/(?:\s|<br\s*\/?>|<p>\s*<\/p>)+<\/li>/gi, "</li>")
    .replace(/<li><p>((?:(?!<\/?p>).)*)<\/p><\/li>/gi, "<li>$1</li>");
