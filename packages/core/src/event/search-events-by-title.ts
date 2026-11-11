import { type DateTime, DateTimeSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";

export const EVENT_TITLE_SEARCH_LIMIT = 20;
export const EVENT_TITLE_SEARCH_PALETTE_LIMIT = 8;
export const EVENT_TITLE_SEARCH_MIN = 2;
export const EVENT_TITLE_SEARCH_MAX = 80;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_SUBSEQUENCE_TOKEN_LENGTH = 3;
const FUZZY_MIN_NEEDLE_LENGTH = 4;

/** Strip wrapping quotes and trailing sentence punctuation so "play." still matches Play. */
function normalizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/[.!?]+$/g, "");
}

/** Fold accents and turn punctuation into word breaks for tolerant title matching. */
export function normalizeEventTitleForSearch(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactNormalized(normalized: string): string {
  return normalized.replace(/\s+/g, "");
}

function hasWordStartingWith(haystack: string, token: string): boolean {
  return haystack.split(/\s+/).some((word) => word.startsWith(token));
}

function isSubsequence(haystack: string, token: string): boolean {
  let position = 0;
  for (const char of token) {
    position = haystack.indexOf(char, position);
    if (position === -1) return false;
    position += 1;
  }
  return true;
}

function levenshteinWithin(a: string, b: string, maxDistance: number): boolean {
  if (a === b) return true;
  if (maxDistance === 0) return false;
  if (Math.abs(a.length - b.length) > maxDistance) return false;

  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);
  let current = new Array<number>(cols);

  for (let row = 1; row < rows; row += 1) {
    current[0] = row;
    let rowMin = row;
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      const deleteCost = (previous[col] ?? 0) + 1;
      const insertCost = (current[col - 1] ?? 0) + 1;
      const replaceCost = (previous[col - 1] ?? 0) + cost;
      const distance = Math.min(deleteCost, insertCost, replaceCost);
      current[col] = distance;
      rowMin = Math.min(rowMin, distance);
    }
    if (rowMin > maxDistance) return false;
    [previous, current] = [current, previous];
  }

  return (previous[cols - 1] ?? 0) <= maxDistance;
}

/**
 * Higher is a better match; 0 means the query does not match this title.
 * Exported for unit tests.
 */
export function scoreEventTitleSearch(title: string, query: string): number {
  const literalNeedle = normalizeSearchQuery(query);
  if (literalNeedle.length < EVENT_TITLE_SEARCH_MIN) return 0;

  const normalized = normalizeEventTitleForSearch(title);
  const normalizedNeedle = normalizeEventTitleForSearch(literalNeedle);
  if (!normalized && !literalNeedle) return 0;

  const compact = compactNormalized(normalized);
  const needleCompact = compactNormalized(normalizedNeedle);

  if (compact === needleCompact) return 5;
  if (compact.startsWith(needleCompact)) return 4;
  if (hasWordStartingWith(normalized, needleCompact)) return 3;
  if (compact.includes(needleCompact)) return 2;

  if (
    needleCompact.length >= MIN_SUBSEQUENCE_TOKEN_LENGTH &&
    isSubsequence(compact, needleCompact)
  ) {
    return 1;
  }

  if (needleCompact.length >= FUZZY_MIN_NEEDLE_LENGTH) {
    const words = normalized.split(/\s+/).filter(Boolean);
    if (
      levenshteinWithin(compact, needleCompact, 1) ||
      words.some((word) => levenshteinWithin(word, needleCompact, 1))
    ) {
      return 1;
    }
  }

  if (title.toLowerCase().includes(literalNeedle)) {
    return 2;
  }

  return 0;
}

function minScoreForQuery(needleLength: number): number {
  // Two-character queries only match clear prefix/substring hits, not fuzzy noise.
  return needleLength <= 2 ? 2 : 1;
}

export function eventTitleSearchWindow(now = Date.now()): {
  start: DateTime;
  end: DateTime;
} {
  return {
    start: DateTimeSchema.parse(new Date(now - YEAR_MS).toISOString()),
    end: DateTimeSchema.parse(new Date(now + YEAR_MS).toISOString()),
  };
}

export function eventTitle(event: Event): string {
  return event.content.kind === "details" ? event.content.title : "";
}

export function eventStartMs(event: Event): number {
  if (event.schedule.kind === "allDay") {
    return Date.parse(`${event.schedule.start}T00:00:00.000Z`);
  }
  return Date.parse(event.schedule.start);
}

/** Fuzzy title search, ±1 year from `now`, best match first then nearest start. */
export function searchEventsByTitle(
  events: readonly Event[],
  q: string,
  now = Date.now(),
  limit = EVENT_TITLE_SEARCH_LIMIT,
): Event[] {
  const literalNeedle = normalizeSearchQuery(q);
  if (literalNeedle.length < EVENT_TITLE_SEARCH_MIN) return [];

  const minScore = minScoreForQuery(literalNeedle.length);
  const window = eventTitleSearchWindow(now);
  const windowStart = Date.parse(window.start);
  const windowEnd = Date.parse(window.end);

  const matches = events
    .map((event) => {
      const start = eventStartMs(event);
      if (Number.isNaN(start) || start < windowStart || start > windowEnd) {
        return null;
      }
      const score = scoreEventTitleSearch(eventTitle(event), literalNeedle);
      if (score < minScore) return null;
      return { event, score, distance: Math.abs(start - now) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.distance - right.distance;
    })
    .map(({ event }) => event);

  const seenSeriesIds = new Set<string>();
  const collapsed: Event[] = [];
  for (const match of matches) {
    if (match.recurrence.kind === "occurrence") {
      if (seenSeriesIds.has(match.recurrence.seriesId)) continue;
      seenSeriesIds.add(match.recurrence.seriesId);
    }
    collapsed.push(match);
  }

  return collapsed
    .filter(
      (event) =>
        event.recurrence.kind !== "series" || !seenSeriesIds.has(event.id),
    )
    .slice(0, limit);
}
