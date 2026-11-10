import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * The app-facing occurrence id (`${eventId}::${recurrenceId}`) is owned by
 * `packages/core/src/util/occurrence-id.ts`: the backend mints it in
 * `event-list.translation.ts` and decodes it back into a single-occurrence
 * command target in `event-command.translation.ts`. The macOS app cannot
 * import that module, so `OccurrenceIdFormat.swift` mirrors it.
 *
 * Nothing in the Swift test suite can notice if that mirror drifts: a macOS
 * split fixture composes its own ids, so a wrong separator agrees with itself
 * and only diverges against the real server. These checks run on Linux and
 * pin the two sides of the mirror together.
 */
const CORE_CODEC = "packages/core/src/util/occurrence-id.ts";
const SWIFT_CODEC =
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Recurrence/OccurrenceIdFormat.swift";
const SWIFT_SPLIT_PROJECTION =
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Recurrence/ProjectRecurringEdit.swift";

const read = (path: string) => readFileSync(path, "utf8");

const separatorFrom = (source: string, pattern: RegExp): string => {
  const match = source.match(pattern);
  if (!match?.[1]) throw new Error("no separator literal found");
  return match[1];
};

describe("occurrence id format", () => {
  it("pins the Swift mirror to the separator core owns", () => {
    const core = separatorFrom(read(CORE_CODEC), /const SEPARATOR = "([^"]+)"/);
    const swift = separatorFrom(
      read(SWIFT_CODEC),
      /public static let separator = "([^"]+)"/,
    );

    expect(core).toBe("::");
    expect(swift).toBe(core);
  });

  it("keeps the macOS split projection on the shared codec", () => {
    const projection = read(SWIFT_SPLIT_PROJECTION);

    // Composing or decoding an occurrence id by hand here is what let the
    // projection derive the split point from a `|` that server-minted ids
    // never carry: the whole id became the recurrenceId, so macOS and sync
    // hashed different remainder-master ids for one split.
    expect(projection).toContain("OccurrenceIdFormat.compose(");
    expect(projection).toContain("OccurrenceIdFormat.recurrenceId(");
    expect(projection).not.toContain('"::"');
  });
});
