// The DOMPurify allowlist for event description HTML, which arrives from
// calendar providers as untrusted input. It is the formatting subset the
// description editor supports, and CompassKit's `HTMLFragment` parses the
// same subset on the native client.
//
// Two call sites sanitize with it: the editor itself, against the browser's
// DOM, and `desktop-export/html-fragment`, against a jsdom window, when it
// emits the parity vectors the native parser is tested on. They need
// different DOMPurify instances but must never allow different tags: a tag
// added here for the editor and missed there would ship a native parser that
// silently drops markup the web app renders.
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
];

// `href` is the only attribute let through. The editor forces target/rel on
// its own link mark regardless of what survived on the source tag.
export const DESCRIPTION_HTML_ALLOWED_ATTR = ["href"];
