type TimeZoneNameStyle = "short" | "shortOffset";

function timeZoneNamePart(
  timeZone: string,
  at: Date,
  timeZoneName: TimeZoneNameStyle,
): string | undefined {
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
}

function looksLikeIanaId(value: string): boolean {
  return value.includes("/");
}

/**
 * Short wall-clock label for a zone at `at` (defaults to now, so DST flips
 * the abbreviation without a reload). Prefers Intl `timeZoneName: "short"`
 * ("MDT"); zones that only have an offset form keep that ("GMT+5:30").
 */
export function formatTimeZoneAbbreviation(
  timeZone: string,
  at: Date = new Date(),
): string {
  const short = timeZoneNamePart(timeZone, at, "short");
  if (short && !looksLikeIanaId(short)) {
    return short;
  }

  return timeZoneNamePart(timeZone, at, "shortOffset") ?? short ?? timeZone;
}
