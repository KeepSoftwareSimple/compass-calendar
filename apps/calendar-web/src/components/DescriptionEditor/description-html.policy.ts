// DOMPurify allowlist for event description HTML from calendar providers
// (untrusted input). Matches the formatting subset the description editor
// supports.
//
// Sanitize at the editor and anywhere else provider HTML is rendered in the
// web app. Use a fresh DOMPurify instance per environment (browser DOM vs
// jsdom in tests), but keep this tag list identical everywhere.
export const DESCRIPTION_HTML_ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "ul",
  "ol",
  "li",
  "a",
] as const;

// `href` is the only attribute let through. The editor forces target/rel on
// its own link mark regardless of what survived on the source tag.
export const DESCRIPTION_HTML_ALLOWED_ATTR = ["href"];
