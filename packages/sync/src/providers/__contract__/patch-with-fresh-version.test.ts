import { EventScheduleSchema } from "@core/types/event.contracts";
import { SyncEventContentSchema } from "@core/types/sync/event.contracts";
import { patchWithFreshVersion } from "@sync/providers/__contract__/patch-with-fresh-version";
import {
  type ProviderPatchInput,
  ProviderWriteError,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";
import { describe, expect, it } from "bun:test";

const PATCH: ProviderPatchInput = {
  accessToken: "token",
  calendarId: "cal",
  providerEventId: "evt",
  expectedVersion: "v1",
  content: SyncEventContentSchema.parse({
    title: "t",
    description: "",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  }),
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2026-09-12T10:00:00.000Z",
    end: "2026-09-12T10:30:00.000Z",
    timeZone: "UTC",
  }),
  recurrence: { kind: "single" },
  invitation: "none",
};

const conflict = () =>
  new ProviderWriteError("versionConflict", "stale", { cause: undefined });

function fakeWriter(currentVersion: () => string) {
  const seen: (string | null)[] = [];
  return {
    seen,
    patchEvent: async (
      input: ProviderPatchInput,
    ): Promise<ProviderWriteResult> => {
      seen.push(input.expectedVersion);
      if (input.expectedVersion !== currentVersion()) throw conflict();
      return {
        providerEventId: input.providerEventId,
        providerVersion: `${input.expectedVersion}-patched`,
      };
    },
  };
}

describe("patchWithFreshVersion", () => {
  it("re-reads the version after a conflict and patches against it", async () => {
    const writer = fakeWriter(() => "v2");
    let reads = 0;
    const result = await patchWithFreshVersion(
      writer,
      PATCH,
      async () => {
        reads += 1;
        return "v2";
      },
      0,
    );
    expect(result.providerVersion).toBe("v2-patched");
    expect(writer.seen).toEqual(["v1", "v2"]);
    expect(reads).toBe(1);
  });

  it("rethrows a non-conflict failure without re-reading", async () => {
    let reads = 0;
    const writer = {
      patchEvent: async (): Promise<ProviderWriteResult> => {
        throw new ProviderWriteError("readOnlyCalendar", "nope");
      },
    };
    await expect(
      patchWithFreshVersion(
        writer,
        PATCH,
        async () => {
          reads += 1;
          return "v2";
        },
        0,
      ),
    ).rejects.toMatchObject({ reason: "readOnlyCalendar" });
    expect(reads).toBe(0);
  });

  it("gives up with the conflict once the attempts are spent", async () => {
    const writer = fakeWriter(() => "never");
    let reads = 0;
    await expect(
      patchWithFreshVersion(
        writer,
        PATCH,
        async () => {
          reads += 1;
          return `v${reads + 1}`;
        },
        0,
      ),
    ).rejects.toMatchObject({ reason: "versionConflict" });
    expect(writer.seen).toEqual(["v1", "v2", "v3", "v4", "v5"]);
    expect(reads).toBe(4);
  });
});
