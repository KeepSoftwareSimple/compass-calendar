/**
 * Swift names the generators must not emit bare. Two axes:
 *
 * - Foundation *type* names a generated CompassKit type would shadow. Those
 *   are a hard error: shadowing `Date` or `Calendar` compiles until some call
 *   site resolves the wrong one, so the generator stops and asks for a
 *   `swiftName`.
 * - Language *keywords*, which an identifier may legitimately need. Those are
 *   escaped with backticks rather than rejected, since the raw value is also
 *   the wire format (`case `default` = "default"`) and cannot be renamed.
 *
 * Both Swift emitters (`swift-contracts/emit-swift` for the Zod contracts and
 * `desktop-export/swift-identifiers` for shortcut and event ids) share this
 * module so a keyword can only ever be handled one way.
 */

/** Swift / Foundation type names that must not be used as generated CompassKit public types. */
export const SWIFT_FOUNDATION_RESERVED_TYPE_NAMES = new Set([
  "Calendar",
  "Character",
  "Data",
  "Date",
  "DateComponents",
  "DateFormatter",
  "DateInterval",
  "Error",
  "FileManager",
  "Locale",
  "Notification",
  "ProcessInfo",
  "Result",
  "Set",
  "Task",
  "Thread",
  "TimeZone",
  "URL",
  "UUID",
]);

/** Swift language keywords, which an identifier escapes with backticks. */
export const SWIFT_KEYWORDS = new Set([
  "as",
  "associatedtype",
  "break",
  "case",
  "catch",
  "class",
  "continue",
  "default",
  "defer",
  "deinit",
  "do",
  "dynamicType",
  "else",
  "enum",
  "extension",
  "fallthrough",
  "false",
  "fileprivate",
  "for",
  "func",
  "guard",
  "if",
  "import",
  "in",
  "init",
  "inout",
  "internal",
  "is",
  "let",
  "nil",
  "open",
  "operator",
  "precedencegroup",
  "private",
  "protocol",
  "public",
  "repeat",
  "rethrows",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "subscript",
  "super",
  "switch",
  "throw",
  "throws",
  "true",
  "try",
  "typealias",
  "var",
  "where",
  "while",
]);

/** Backticks a Swift identifier that collides with a language keyword. */
export function escapeSwiftKeyword(identifier: string): string {
  return SWIFT_KEYWORDS.has(identifier) ? `\`${identifier}\`` : identifier;
}

export function assertSwiftPublicTypeName(name: string, context: string): void {
  if (SWIFT_FOUNDATION_RESERVED_TYPE_NAMES.has(name)) {
    throw new Error(
      `${context}: Swift type name "${name}" shadows Foundation; pick another swiftName (for example Compass${name})`,
    );
  }
}
