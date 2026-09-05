import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import {
  compareCalendars,
  getDefaultTargetCalendar,
  getLocalCalendar,
  getWritableCalendars,
  groupCalendarsByAccount,
  spansMultipleAccounts,
} from "./calendar.util";
import { describe, expect, it } from "bun:test";

function makeCalendar(overrides: Partial<Calendar>): Calendar {
  return {
    id: "507f1f77bcf86cd799439011" as Calendar["id"],
    name: "Cal",
    description: "",
    timeZone: null,
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    provider: "local",
    access: "owner",
    capabilities: {
      ...getCalendarCapabilities("owner"),
      canManage: false,
      canWatchEvents: false,
      canInviteAttendees: false,
    },
    isPrimary: false,
    isVisible: true,
    isActive: true,
    ...overrides,
  };
}

describe("getLocalCalendar", () => {
  it("finds the local-provider calendar", () => {
    const local = makeCalendar({ provider: "local" });
    const google = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    expect(getLocalCalendar([google, local])).toBe(local);
  });

  it("returns undefined when there is no local calendar", () => {
    const google = makeCalendar({ provider: "google" });
    expect(getLocalCalendar([google])).toBeUndefined();
  });
});

describe("getWritableCalendars", () => {
  it("includes the local calendar when no account is connected", () => {
    const local = makeCalendar({ provider: "local" });
    expect(getWritableCalendars([local])).toEqual([local]);
  });

  it("excludes a non-writable or inactive calendar regardless of connection state", () => {
    const readOnly = makeCalendar({
      provider: "google",
      capabilities: getCalendarCapabilities("reader"),
    });
    const inactive = makeCalendar({ provider: "google", isActive: false });
    expect(getWritableCalendars([readOnly, inactive])).toEqual([]);
  });

  it("drops the local calendar once an account is connected", () => {
    const local = makeCalendar({ provider: "local" });
    const google = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    expect(
      getWritableCalendars([local, google], { hasConnectedAccount: true }),
    ).toEqual([google]);
  });

  it("excludes calendars whose Google account needs reconnect", () => {
    const broken = makeCalendar({
      provider: "google",
      accountEmail: "broken@example.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const healthy = makeCalendar({
      provider: "google",
      accountEmail: "ok@example.com",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });
    expect(
      getWritableCalendars([broken, healthy], {
        hasConnectedAccount: true,
        reconnectRequiredEmails: ["broken@example.com"],
      }),
    ).toEqual([healthy]);
  });
});

describe("getDefaultTargetCalendar", () => {
  it("prefers the primary writable google calendar", () => {
    const local = makeCalendar({ provider: "local" });
    const primaryGoogle = makeCalendar({
      provider: "google",
      isPrimary: true,
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    expect(getDefaultTargetCalendar([local, primaryGoogle])).toBe(
      primaryGoogle,
    );
  });

  it("prefers a writable microsoft primary the same way", () => {
    const local = makeCalendar({ provider: "local" });
    const primaryMicrosoft = makeCalendar({
      provider: "microsoft",
      isPrimary: true,
      id: "507f1f77bcf86cd799439014" as Calendar["id"],
    });
    expect(getDefaultTargetCalendar([local, primaryMicrosoft])).toBe(
      primaryMicrosoft,
    );
  });

  it("skips a reconnect-required account when choosing the default target", () => {
    const brokenPrimary = makeCalendar({
      provider: "google",
      isPrimary: true,
      accountEmail: "broken@example.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const healthyPrimary = makeCalendar({
      provider: "google",
      isPrimary: true,
      accountEmail: "ok@example.com",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });
    expect(
      getDefaultTargetCalendar([brokenPrimary, healthyPrimary], {
        accountEmailOrder: ["broken@example.com", "ok@example.com"],
        reconnectRequiredEmails: ["broken@example.com"],
      }),
    ).toBe(healthyPrimary);
  });

  it("ignores a non-primary or read-only google calendar", () => {
    const local = makeCalendar({ provider: "local" });
    const secondaryGoogle = makeCalendar({
      provider: "google",
      isPrimary: false,
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const readOnlyPrimary = makeCalendar({
      provider: "google",
      isPrimary: true,
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
      capabilities: getCalendarCapabilities("reader"),
    });
    expect(
      getDefaultTargetCalendar([local, secondaryGoogle, readOnlyPrimary]),
    ).toBe(local);
  });

  it("falls back to local when no google calendar qualifies", () => {
    const local = makeCalendar({ provider: "local" });
    expect(getDefaultTargetCalendar([local])).toBe(local);
  });

  it("returns undefined when there is no calendar at all", () => {
    expect(getDefaultTargetCalendar([])).toBeUndefined();
  });

  it("honors the user's starred calendar over the derived default", () => {
    const primaryGoogle = makeCalendar({
      provider: "google",
      isPrimary: true,
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const starred = makeCalendar({
      provider: "google",
      isPrimary: false,
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });

    expect(
      getDefaultTargetCalendar([primaryGoogle, starred], {
        preferredCalendarId: starred.id,
      }),
    ).toBe(starred);
  });

  it("lets the local calendar be starred explicitly while disconnected", () => {
    const local = makeCalendar({ provider: "local" });
    const primaryGoogle = makeCalendar({
      provider: "google",
      isPrimary: true,
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });

    expect(
      getDefaultTargetCalendar([local, primaryGoogle], {
        preferredCalendarId: local.id,
      }),
    ).toBe(local);
  });

  it("ignores a starred local calendar once an account is connected", () => {
    const local = makeCalendar({ provider: "local" });
    const primaryGoogle = makeCalendar({
      provider: "google",
      isPrimary: true,
      accountEmail: "user@example.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });

    expect(
      getDefaultTargetCalendar([local, primaryGoogle], {
        preferredCalendarId: local.id,
        accountEmailOrder: ["user@example.com"],
      }),
    ).toBe(primaryGoogle);
  });

  it("does not fall back to local once an account is connected", () => {
    const local = makeCalendar({ provider: "local" });
    const readOnlyPrimary = makeCalendar({
      provider: "google",
      isPrimary: true,
      accountEmail: "user@example.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      capabilities: getCalendarCapabilities("reader"),
    });

    expect(
      getDefaultTargetCalendar([local, readOnlyPrimary], {
        accountEmailOrder: ["user@example.com"],
      }),
    ).toBeUndefined();
  });

  it("falls back to the derived default when the starred calendar is gone", () => {
    const primaryGoogle = makeCalendar({
      provider: "google",
      isPrimary: true,
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });

    expect(
      getDefaultTargetCalendar([primaryGoogle], {
        preferredCalendarId: "507f1f77bcf86cd799439099",
      }),
    ).toBe(primaryGoogle);
  });

  it("falls back when the starred calendar is no longer writable", () => {
    const primaryGoogle = makeCalendar({
      provider: "google",
      isPrimary: true,
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const demoted = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
      capabilities: getCalendarCapabilities("reader"),
    });

    expect(
      getDefaultTargetCalendar([primaryGoogle, demoted], {
        preferredCalendarId: demoted.id,
      }),
    ).toBe(primaryGoogle);
  });

  it("picks the oldest-connected account's primary when two accounts each have one", () => {
    // Both are primary and writable, so without connection order this is a
    // coin flip decided by array position.
    const newerAccountPrimary = makeCalendar({
      provider: "google",
      isPrimary: true,
      accountEmail: "new@example.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const olderAccountPrimary = makeCalendar({
      provider: "google",
      isPrimary: true,
      accountEmail: "old@example.com",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });

    expect(
      getDefaultTargetCalendar([newerAccountPrimary, olderAccountPrimary], {
        accountEmailOrder: ["old@example.com", "new@example.com"],
      }),
    ).toBe(olderAccountPrimary);
  });

  it("still resolves when the connection order names an account with no primary", () => {
    const primary = makeCalendar({
      provider: "google",
      isPrimary: true,
      accountEmail: "new@example.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });

    expect(
      getDefaultTargetCalendar([primary], {
        accountEmailOrder: ["old@example.com", "new@example.com"],
      }),
    ).toBe(primary);
  });
});

describe("compareCalendars", () => {
  it("orders by account (connection order), then primary first, then name", () => {
    const work = makeCalendar({ name: "Work", accountEmail: "old@x.com" });
    const personal = makeCalendar({
      name: "Personal",
      isPrimary: true,
      accountEmail: "old@x.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const side = makeCalendar({
      name: "Side",
      accountEmail: "new@x.com",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      id: "507f1f77bcf86cd799439014" as Calendar["id"],
    });

    const ordered = [local, side, work, personal].sort(
      compareCalendars(["old@x.com", "new@x.com"]),
    );

    expect(ordered.map((c) => c.name)).toEqual([
      "Personal",
      "Work",
      "Side",
      "Compass",
    ]);
  });

  it("ranks an unlisted account the same as no account - both sort after known accounts, then alphabetically", () => {
    const known = makeCalendar({ name: "Known", accountEmail: "old@x.com" });
    const unknown = makeCalendar({
      name: "Unknown",
      accountEmail: "mystery@x.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });

    const ordered = [local, unknown, known].sort(
      compareCalendars(["old@x.com"]),
    );

    expect(ordered.map((c) => c.name)).toEqual(["Known", "Compass", "Unknown"]);
  });
});

describe("spansMultipleAccounts", () => {
  it("is false for zero or one distinct account", () => {
    expect(spansMultipleAccounts([])).toBe(false);
    expect(
      spansMultipleAccounts([
        makeCalendar({ accountEmail: "a@x.com" }),
        makeCalendar({
          accountEmail: "a@x.com",
          id: "507f1f77bcf86cd799439012" as Calendar["id"],
        }),
      ]),
    ).toBe(false);
  });

  it("is true once a second distinct account appears", () => {
    expect(
      spansMultipleAccounts([
        makeCalendar({ accountEmail: "a@x.com" }),
        makeCalendar({
          accountEmail: "b@x.com",
          id: "507f1f77bcf86cd799439012" as Calendar["id"],
        }),
      ]),
    ).toBe(true);
  });
});

describe("groupCalendarsByAccount", () => {
  const connection = (accountEmail: string): GoogleSyncConnectionSummary => ({
    id: `conn-${accountEmail}`,
    state: "healthy",
    stateReason: null,
    lastSyncedAt: null,
    lastHealthyAt: null,
    accountEmail,
    connectionState: "HEALTHY",
    canSuggestContacts: false,
  });

  it("buckets by account in connection order and leaves the local calendar ungrouped", () => {
    const work = makeCalendar({ name: "Work", accountEmail: "old@x.com" });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "new@x.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });

    const { groups, ungrouped } = groupCalendarsByAccount(
      [personal, work, local],
      [connection("old@x.com"), connection("new@x.com")],
    );

    expect(groups.map((g) => g.accountEmail)).toEqual([
      "old@x.com",
      "new@x.com",
    ]);
    expect(ungrouped).toEqual([local]);
  });

  it("groups a lone connected account too - no two-account threshold", () => {
    const work = makeCalendar({ name: "Work", accountEmail: "old@x.com" });

    const { groups } = groupCalendarsByAccount(
      [work],
      [connection("old@x.com")],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.calendars).toEqual([work]);
  });

  it("keeps a connected account with no calendars yet", () => {
    const { groups } = groupCalendarsByAccount([], [connection("old@x.com")]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.accountEmail).toBe("old@x.com");
    expect(groups[0]?.calendars).toEqual([]);
  });

  it("nests the local calendar under the Google account that matches compassEmail", () => {
    const work = makeCalendar({
      name: "Work",
      provider: "google",
      accountEmail: "old@x.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      provider: "google",
      accountEmail: "new@x.com",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });

    const { groups, ungrouped } = groupCalendarsByAccount(
      [personal, work, local],
      [connection("old@x.com"), connection("new@x.com")],
      "old@x.com",
    );

    expect(ungrouped).toEqual([]);
    expect(groups[0]?.calendars).toEqual([work, local]);
    expect(groups[1]?.calendars).toEqual([personal]);
  });

  it("matches compassEmail to a Google account case-insensitively", () => {
    const work = makeCalendar({
      name: "Work",
      provider: "google",
      accountEmail: "Old@X.com",
    });
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });

    const { groups, ungrouped } = groupCalendarsByAccount(
      [work, local],
      [connection("Old@X.com")],
      "  old@x.com  ",
    );

    expect(ungrouped).toEqual([]);
    expect(groups[0]?.calendars).toEqual([work, local]);
  });

  it("leaves the local calendar ungrouped when compassEmail matches no Google account", () => {
    const work = makeCalendar({
      name: "Work",
      provider: "google",
      accountEmail: "old@x.com",
    });
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
    });

    const { groups, ungrouped } = groupCalendarsByAccount(
      [work, local],
      [connection("old@x.com")],
      "login@x.com",
    );

    expect(ungrouped).toEqual([local]);
    expect(groups[0]?.calendars).toEqual([work]);
  });
});
