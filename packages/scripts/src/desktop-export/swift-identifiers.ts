const SWIFT_KEYWORDS = new Set([
  "associatedtype",
  "class",
  "deinit",
  "enum",
  "extension",
  "fileprivate",
  "func",
  "import",
  "init",
  "inout",
  "internal",
  "let",
  "open",
  "operator",
  "private",
  "precedencegroup",
  "protocol",
  "public",
  "rethrows",
  "static",
  "struct",
  "subscript",
  "typealias",
  "var",
  "break",
  "case",
  "continue",
  "default",
  "defer",
  "do",
  "else",
  "fallthrough",
  "for",
  "guard",
  "if",
  "in",
  "repeat",
  "return",
  "switch",
  "where",
  "while",
  "as",
  "catch",
  "dynamicType",
  "false",
  "is",
  "nil",
  "super",
  "self",
  "Self",
  "throw",
  "throws",
  "true",
  "try",
]);

export const kebabToCamelCase = (value: string): string => {
  const parts = value.split("-");
  const head = parts[0] ?? "";
  const tail = parts
    .slice(1)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `${head}${tail}`;
};

export const snakeToCamelCase = (value: string): string =>
  value
    .split("_")
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");

export const swiftEnumCaseName = (rawId: string): string => {
  const camel = kebabToCamelCase(rawId);
  if (SWIFT_KEYWORDS.has(camel)) {
    return `\`${camel}\``;
  }
  return camel;
};

export const formatSwiftDouble = (value: number): string => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  const text = rounded.toString();
  return text.includes(".") ? text : `${text}.0`;
};
