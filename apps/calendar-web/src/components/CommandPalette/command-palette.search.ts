import { type CommandItem, type CommandSection } from "./command-palette.types";

const MIN_SUBSEQUENCE_TOKEN_LENGTH = 3;

/** Strip wrapping quotes and trailing sentence punctuation so "play." still matches Play. */
function normalizeSearchToken(token: string): string {
  return token.replace(/^['"]+|['"]+$/g, "").replace(/[.!?]+$/g, "");
}

function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(normalizeSearchToken)
    .filter(Boolean);
}

/** Every word of the haystack starts with the token, e.g. "day" in "Go to Day". */
function hasWordStartingWith(haystack: string, token: string): boolean {
  return haystack.split(/[\s-]+/).some((word) => word.startsWith(token));
}

/** True if every character of `token` appears in `haystack`, in order. */
function isSubsequence(haystack: string, token: string): boolean {
  let position = 0;
  for (const char of token) {
    position = haystack.indexOf(char, position);
    if (position === -1) return false;
    position += 1;
  }
  return true;
}

/** Higher is a better match; 0 means the token does not match this haystack at all. */
function scoreToken(haystack: string, token: string): number {
  if (haystack === token) return 5;
  if (haystack.startsWith(token)) return 4;
  if (hasWordStartingWith(haystack, token)) return 3;
  if (haystack.includes(token)) return 2;
  if (
    token.length >= MIN_SUBSEQUENCE_TOKEN_LENGTH &&
    isSubsequence(haystack, token)
  ) {
    return 1;
  }
  return 0;
}

/**
 * Scores an item against a (already-normalized, whitespace-split) list of
 * query tokens. Every token must match something — label or a keyword — or
 * the item is excluded entirely (0). A label match outranks a keyword match
 * at the same tier, so exact/prefix hits on the visible text always sort
 * above synonym-only hits.
 */
function scoreAgainstTokens(
  item: Pick<CommandItem, "label" | "keywords">,
  tokens: string[],
): number {
  const label = item.label.toLowerCase();
  const keywords = (item.keywords ?? []).map((keyword) =>
    keyword.toLowerCase(),
  );

  let total = 0;
  for (const token of tokens) {
    const labelTier = scoreToken(label, token);
    const keywordTier = Math.max(
      0,
      ...keywords.map((k) => scoreToken(k, token)),
    );

    if (labelTier === 0 && keywordTier === 0) return 0;

    const bestTier = Math.max(labelTier, keywordTier);
    total += bestTier * 2 + (labelTier === bestTier ? 1 : 0);
  }
  return total;
}

/** 0 = no match; higher = better. Exported for unit tests. */
export function scoreCommandItem(
  item: Pick<CommandItem, "label" | "keywords">,
  query: string,
): number {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 0;
  return scoreAgainstTokens(item, tokens);
}

/**
 * Finds where each query token appears as a literal substring in `label`
 * (case-insensitive) so the UI can bold the matched characters. Only covers
 * the prefix/word-prefix/substring tiers — the visually satisfying majority
 * of real matches. Tokens that only matched via subsequence or a keyword
 * (not the label itself) are simply not highlighted; that's a deliberate
 * scope cut, not a bug, since subsequence highlighting would be noisy and
 * rarely hit in practice. Overlapping/adjacent ranges are merged.
 */
export function getLabelMatchRanges(
  label: string,
  query: string,
): Array<[number, number]> {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const lowerLabel = label.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    const index = lowerLabel.indexOf(token);
    if (index !== -1) ranges.push([index, index + token.length]);
  }
  if (ranges.length === 0) return [];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [ranges[0]];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/**
 * Fuzzy-filters each section's items against `search`: label + keyword
 * synonyms, multi-word queries requiring every word to match, typo-tolerant
 * subsequence matching as a last resort. Items are ranked by score within
 * their section (section order and headings are unchanged — the palette's
 * grouping is structural) so the best match in a group sorts to the top.
 * Sections with no surviving items are dropped so their heading disappears too.
 */
export function filterSections(
  sections: CommandSection[],
  search: string,
): CommandSection[] {
  const tokens = tokenizeQuery(search);
  if (tokens.length === 0) return sections;

  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => ({ item, score: scoreAgainstTokens(item, tokens) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item),
    }))
    .filter((section) => section.items.length > 0);
}
