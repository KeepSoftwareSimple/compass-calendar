import { type SyncEventContent } from "@core/types/sync/event.contracts";
import {
  isColorOnlyProviderUpdate,
  providerColorOnlyPatchFlags,
} from "@sync/domain/color-only-update";
import { describe, expect, it } from "bun:test";

const baseContent = (): SyncEventContent => ({
  title: "Meet",
  description: "",
  location: "",
  organizer: null,
  attendees: [],
  conference: null,
});

const updateCommand = (overrides: Record<string, unknown> = {}) => ({
  input: {
    kind: "update" as const,
    invitation: "none" as const,
    attendeesEdit: "preserve" as const,
    recurrence: { kind: "preserve" as const },
    scope: "this" as const,
    recurrenceId: null,
    content: baseContent(),
    ...overrides,
  },
});

describe("isColorOnlyProviderUpdate", () => {
  it("returns true when only color changes and schedule is omitted", () => {
    const stored = baseContent();
    const merged = { ...stored, color: "blue" as const };
    expect(
      isColorOnlyProviderUpdate(
        updateCommand() as never,
        stored,
        merged,
        undefined,
      ),
    ).toBe(true);
  });

  it("returns false when schedule is present", () => {
    const stored = baseContent();
    const merged = { ...stored, color: "blue" as const };
    expect(
      isColorOnlyProviderUpdate(
        updateCommand({
          schedule: {
            kind: "timed",
            start: "2026-07-01T16:00:00.000Z",
            end: "2026-07-01T17:00:00.000Z",
            timeZone: "UTC",
          },
        }) as never,
        stored,
        merged,
        undefined,
      ),
    ).toBe(false);
  });
});

describe("providerColorOnlyPatchFlags", () => {
  it("sets writeSchedule false and colorOnly for recurring scope-this color edits", () => {
    const stored = baseContent();
    const merged = { ...stored, color: "mint" as const };
    expect(
      providerColorOnlyPatchFlags(updateCommand() as never, stored, merged),
    ).toEqual({ writeSchedule: false, colorOnly: true });
  });
});
