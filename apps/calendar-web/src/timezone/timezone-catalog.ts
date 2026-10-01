import { scoreCommandItem } from "@web/components/CommandPalette/command-palette.search";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";

export interface TimeZoneListItem {
  id: string;
  city: string;
  /** Generic zone name such as "Central Time"; empty when Intl only knows an offset. */
  name: string;
  region: string;
  abbreviation: string;
  offset: string;
  offsetMinutes: number;
  secondary: string;
  keywords: string[];
}

export function timeZoneCityName(id: string): string {
  const last = id.split("/").pop() ?? id;
  return last.replaceAll("_", " ");
}

function regionFromIanaId(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(0, slash);
}

function timeZoneNamePart(
  timeZone: string,
  at: Date,
  timeZoneName: "long" | "longGeneric" | "shortOffset",
): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

/** Travelers search "central" or "eastern", not the zone's canonical city. */
function genericZoneName(timeZone: string, at: Date): string {
  const name = timeZoneNamePart(timeZone, at, "longGeneric");
  return name.startsWith("GMT") ? "" : name;
}

/**
 * The best-known city for common zone names. Dozens of zones share
 * "Central Time", so a search for "central" lists Chicago before Knox.
 */
const PRIMARY_ZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Halifax",
  "Europe/London",
  "Europe/Paris",
  "Europe/Athens",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
]);

function offsetAt(
  timeZone: string,
  at: Date,
): { minutes: number; label: string } {
  const raw = timeZoneNamePart(timeZone, at, "shortOffset");
  const match = raw.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return { minutes: 0, label: raw };
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return { minutes: sign * (hours * 60 + minutes), label: raw };
}

let cachedZoneIds: string[] | null = null;
let cachedList: { minute: number; items: TimeZoneListItem[] } | null = null;

function supportedTimeZones(): string[] {
  cachedZoneIds ??= Intl.supportedValuesOf("timeZone");
  return cachedZoneIds;
}

export function buildTimeZoneList(at: Date = new Date()): TimeZoneListItem[] {
  const minute = Math.floor(at.getTime() / 60_000);
  if (cachedList?.minute === minute) {
    return cachedList.items;
  }

  const items = supportedTimeZones().map((id) => {
    const city = timeZoneCityName(id);
    const region = regionFromIanaId(id);
    const abbreviation = formatTimeZoneAbbreviation(id, at);
    const offset = offsetAt(id, at);
    const name = genericZoneName(id, at);
    return {
      id,
      city,
      name,
      region,
      abbreviation,
      offset: offset.label,
      offsetMinutes: offset.minutes,
      secondary: [...new Set([name, abbreviation, offset.label])]
        .filter(Boolean)
        .join(", "),
      keywords: [
        id,
        name,
        timeZoneNamePart(id, at, "long"),
        abbreviation,
        offset.label,
      ],
    };
  });
  cachedList = { minute, items };
  return items;
}

export function sortTimeZonesByOffsetDistance(
  zones: TimeZoneListItem[],
  currentTimeZone: string,
): TimeZoneListItem[] {
  const current = zones.find((zone) => zone.id === currentTimeZone);
  const currentOffset = current?.offsetMinutes ?? 0;

  return [...zones].sort((left, right) => {
    if (left.id === currentTimeZone) return -1;
    if (right.id === currentTimeZone) return 1;

    const leftDistance = Math.abs(left.offsetMinutes - currentOffset);
    const rightDistance = Math.abs(right.offsetMinutes - currentOffset);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return left.city.localeCompare(right.city);
  });
}

export function filterTimeZones(
  zones: TimeZoneListItem[],
  query: string,
): TimeZoneListItem[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return zones;
  }

  return zones
    .map((zone) => ({
      zone,
      // The zone name counts as a label so "pacific" ranks Los Angeles
      // ("Pacific Time") above ids that merely start with "Pacific/".
      score: Math.max(
        scoreCommandItem(
          { label: zone.city, keywords: zone.keywords },
          trimmed,
        ),
        scoreCommandItem(
          { label: zone.name, keywords: zone.keywords },
          trimmed,
        ),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .map((entry) =>
      PRIMARY_ZONES.has(entry.zone.id)
        ? { ...entry, score: entry.score + 0.5 }
        : entry,
    )
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.zone);
}
