/** Encode text for an HTML attribute or text node. Ampersand first so
 * later replacements cannot re-escape it. */
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
