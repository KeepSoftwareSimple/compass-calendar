import dayjs from "@core/util/date/dayjs";

// RRULE UNTIL is inclusive, so truncating "everything at/after `beforeStart`"
// means UNTIL = one second before its instant. Always emits the full UTC
// timed format (matching the backend's withUntil), never a bare date: an
// all-day date-only UNTIL is compared against CompassEventRRule's
// local-timezone-anchored dtstart (mirrors parseCompassEventDate +
// `.local()`), and a bare date silently drops or keeps an extra day
// whenever the local zone's UTC offset is negative (verified across
// America/Denver, Asia/Tokyo, and UTC).
export function truncateSeriesRulesBefore(
  rules: readonly string[],
  beforeStart: string,
): string[] {
  const allDay = !beforeStart.includes("T");
  const excludedInstant = allDay
    ? dayjs(beforeStart, "YYYY-MM-DD").tz(dayjs.tz.guess()).local().toDate()
    : dayjs(beforeStart).toDate();
  const until = dayjs(excludedInstant)
    .subtract(1, "second")
    .utc()
    .toRRuleDTSTARTString();

  return rules.map((rule) => {
    if (!rule.startsWith("RRULE:")) return rule;
    const kept = rule
      .slice("RRULE:".length)
      .split(";")
      .filter(
        (part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT="),
      );
    return `RRULE:${[...kept, `UNTIL=${until}`].join(";")}`;
  });
}
