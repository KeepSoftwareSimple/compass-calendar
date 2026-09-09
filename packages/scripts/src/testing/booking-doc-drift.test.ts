import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const BOOKING_SPEC_PATH = "docs/features/booking.md";

const BOOKING_SUPPORT_DOC_PATHS = [
  "docs/architecture/glossary.md",
  "docs/development/feature-file-map.md",
  "docs/acceptance/shortcuts.md",
  "docs/frontend/shortcut-commandments.md",
] as const;

/** Stale v1.8 product terms; word boundaries avoid "module" and "buffering". */
const STALE_BOOKING_TERMS =
  /\b(?:BookingAddressSetup|BookingLimitsFieldset|weekly-hours\.parse|9-12,\s*1-5|buffer|max meetings per day|welcome text|invite others)\b/i;

const STALE_V19_BOOKING_TERMS =
  /grouped weekly hours|weekly-hours\.rows|\bUnavailable:|\bLive at\b|Pending, maybe|keeps only the first interval|a weekday belongs to at most one row/i;

const STALE_MEETING_MOD_CHORDS = /\bMod\+(?:[4-9]|U)\b/;

const REMOVED_IN_V18 = /removed in Booking v1\.8/i;
const REMOVED_IN_V19 =
  /removed or reversed in v1\.9|reversed in v1\.9|removed in Booking v1\.9/i;

function inChangelogSection(lines: string[], index: number): boolean {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? "";
    if (/^## Changelog\b/.test(line)) return true;
    if (/^## /.test(line)) return false;
  }
  return false;
}

function lineAllowedInBookingSpec(line: string, nearby: string[]): boolean {
  if (REMOVED_IN_V18.test(line) || REMOVED_IN_V19.test(line)) return true;
  if (
    nearby.some(
      (other) => REMOVED_IN_V18.test(other) || REMOVED_IN_V19.test(other),
    )
  ) {
    return true;
  }
  return false;
}

function staleLines(
  content: string,
  options: {
    includeMeetingModChords: boolean;
    allowV18RemovalBlock?: boolean;
    allowV19Changelog?: boolean;
  },
): string[] {
  const lines = content.split("\n");
  return lines.flatMap((line, index) => {
    const matchesV18Term = STALE_BOOKING_TERMS.test(line);
    const matchesV19Term = STALE_V19_BOOKING_TERMS.test(line);
    const matchesMeetingMod =
      options.includeMeetingModChords && STALE_MEETING_MOD_CHORDS.test(line);
    if (!matchesV18Term && !matchesV19Term && !matchesMeetingMod) return [];

    if (options.allowV19Changelog && matchesV19Term && !matchesV18Term) {
      if (inChangelogSection(lines, index)) return [];
    }

    if (options.allowV18RemovalBlock) {
      const nearby = lines.slice(Math.max(0, index - 2), index + 3);
      if (lineAllowedInBookingSpec(line, nearby)) return [];
    }

    return [`${index + 1}: ${line.trim()}`];
  });
}

describe("booking doc drift", () => {
  it("docs/features/booking.md has no stale terms outside the removal wart and v1.9 changelog", () => {
    const content = readFileSync(BOOKING_SPEC_PATH, "utf8");
    expect(
      staleLines(content, {
        includeMeetingModChords: true,
        allowV18RemovalBlock: true,
        allowV19Changelog: true,
      }),
    ).toEqual([]);
  });

  for (const path of BOOKING_SUPPORT_DOC_PATHS) {
    it(`${path} has no stale booking file references or Meeting Mod chords`, () => {
      const content = readFileSync(path, "utf8");
      expect(
        staleLines(content, {
          includeMeetingModChords: false,
        }),
      ).toEqual([]);
    });
  }
});
