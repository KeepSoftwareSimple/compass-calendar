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

export function assertSwiftPublicTypeName(name: string, context: string): void {
  if (SWIFT_FOUNDATION_RESERVED_TYPE_NAMES.has(name)) {
    throw new Error(
      `${context}: Swift type name "${name}" shadows Foundation; pick another swiftName (for example Compass${name})`,
    );
  }
}
