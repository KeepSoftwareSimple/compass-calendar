import { faker } from "@faker-js/faker";
import { getCalendarCapabilities } from "@core/types/calendar.contracts";
import {
  type ProviderCalendar,
  ProviderCalendarSchema,
  type ProviderConnection,
} from "@core/types/sync/connection.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { syncCalendarsToBrowser } from "./calendar-list.translation";
import { describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

const providerCalendar = (
  overrides: Partial<ProviderCalendar> = {},
): ProviderCalendar =>
  ProviderCalendarSchema.parse({
    id: objectId(),
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    connectionId: objectId() as ConnectionId,
    providerCalendarId: "primary@group.calendar.google.com",
    displayName: "Work",
    color: "#33b679",
    active: true,
    primary: false,
    accessRole: "owner",
    capabilities: {
      canReadEvents: true,
      canWriteEvents: true,
      canReadBusy: true,
      canInviteAttendees: true,
    },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  });

// The suite exercises the per-calendar translation through the public list
// entry point: one calendar, joined (when the case needs an email or provider)
// to a minimal connection stub carrying only the fields the join reads.
const syncCalendarToBrowser = (
  calendar: ProviderCalendar,
  connection?: Partial<ProviderConnection>,
) =>
  syncCalendarsToBrowser(
    [calendar],
    connection
      ? [
          {
            id: calendar.connectionId,
            provider: "google",
            account: { email: connection.account?.email },
            ...connection,
          } as unknown as ProviderConnection,
        ]
      : [],
  )[0]!;

describe("syncCalendarToBrowser", () => {
  it("uses the sync calendar id directly as the browser calendar id", () => {
    const calendar = providerCalendar();
    // Option 2: calendars are sync-owned, so no id bridge — the browser uses
    // sync's id verbatim.
    expect<unknown>(syncCalendarToBrowser(calendar).id).toBe(calendar.id);
  });

  it("maps display name, primary, and active through", () => {
    const result = syncCalendarToBrowser(
      providerCalendar({
        displayName: "Personal",
        primary: true,
        active: false,
      }),
    );
    expect(result.name).toBe("Personal");
    expect(result.isPrimary).toBe(true);
    expect(result.isActive).toBe(false);
  });

  it("puts the provider colour on the background and defaults the foreground", () => {
    const result = syncCalendarToBrowser(
      providerCalendar({ color: "#4285f4" }),
    );
    expect(result.backgroundColor).toBe("#4285f4");
    expect(result.foregroundColor).toBe("#000000");
  });

  it("falls back to the legacy default colour when the provider omits one", () => {
    const result = syncCalendarToBrowser(providerCalendar({ color: null }));
    expect(result.backgroundColor).toBe("#9e9e9e");
  });

  it("falls back to the default colour when the provider colour is not hex", () => {
    // Sync stores colour as a loose string; a non-hex value must not 500 the
    // whole calendar list.
    const result = syncCalendarToBrowser(
      providerCalendar({ color: "cornflower" }),
    );
    expect(result.backgroundColor).toBe("#9e9e9e");
  });

  it("always reports the calendar visible (visibility is client-side now)", () => {
    const result = syncCalendarToBrowser(providerCalendar({ active: false }));
    expect(result.isVisible).toBe(true);
  });

  it("leaves description empty and timeZone null (sync stores neither)", () => {
    const result = syncCalendarToBrowser(providerCalendar());
    expect(result.description).toBe("");
    expect(result.timeZone).toBeNull();
  });

  it("carries the owning account's email when the caller supplies one", () => {
    const result = syncCalendarToBrowser(providerCalendar(), {
      account: {
        providerAccountId: "bob-subject" as ProviderAccountId,
        email: "bob@acme.co",
        displayName: null,
      },
    });
    expect(result.accountEmail).toBe("bob@acme.co");
  });

  it("omits accountEmail entirely when the caller supplies none", () => {
    // Absence (not null/empty) is the contract for the local calendar and for
    // provider accounts that reported no email.
    const result = syncCalendarToBrowser(providerCalendar());
    expect("accountEmail" in result).toBe(false);
  });

  it.each([
    ["owner", "owner"],
    ["editor", "writer"],
    ["viewer", "reader"],
    ["busyOnly", "freeBusyReader"],
  ] as const)("maps sync access role %s to browser access %s and derives capabilities", (syncRole, browserAccess) => {
    const canWrite = syncRole === "owner" || syncRole === "editor";
    const result = syncCalendarToBrowser(
      providerCalendar({
        accessRole: syncRole,
        capabilities: {
          canReadEvents: true,
          canWriteEvents: canWrite,
          canReadBusy: true,
          canInviteAttendees: canWrite,
        },
      }),
    );
    expect(result.access).toBe(browserAccess);
    const baseCapabilities = getCalendarCapabilities(browserAccess);
    expect(result.capabilities).toEqual({
      ...baseCapabilities,
      canInviteAttendees: canWrite,
      conferenceKinds: ["meet"],
    });
  });

  it("maps a microsoft connection's provider through to the calendar", () => {
    const calendar = providerCalendar();
    const result = syncCalendarToBrowser(calendar, {
      provider: "microsoft",
      capabilities: ["readEvents", "writeEvents", "createTeamsMeeting"],
    });
    expect(result.provider).toBe("microsoft");
    expect(result.conference).toBe("teams");
  });

  it("derives canInviteAttendees from sync write capability for a writable calendar", () => {
    const result = syncCalendarToBrowser(
      providerCalendar({
        capabilities: {
          canReadEvents: true,
          canWriteEvents: true,
          canReadBusy: true,
          canInviteAttendees: true,
        },
      }),
    );
    expect(result.capabilities.canInviteAttendees).toBe(true);
  });

  it("derives canInviteAttendees false for a read-only sync calendar", () => {
    const result = syncCalendarToBrowser(
      providerCalendar({
        accessRole: "viewer",
        capabilities: {
          canReadEvents: true,
          canWriteEvents: false,
          canReadBusy: true,
          canInviteAttendees: false,
        },
      }),
    );
    expect(result.capabilities.canInviteAttendees).toBe(false);
  });

  it("maps createsGoogleMeet through", () => {
    expect(
      syncCalendarToBrowser(providerCalendar({ createsGoogleMeet: false }))
        .createsGoogleMeet,
    ).toBe(false);
    expect(syncCalendarToBrowser(providerCalendar()).createsGoogleMeet).toBe(
      true,
    );
  });

  it("derives conference from the owning connection's provider", () => {
    expect(syncCalendarToBrowser(providerCalendar()).conference).toBe("meet");
    expect(
      syncCalendarToBrowser(providerCalendar({ createsGoogleMeet: false }))
        .conference,
    ).toBe("none");
    expect(
      syncCalendarToBrowser(providerCalendar(), {
        provider: "microsoft",
        capabilities: ["readEvents", "writeEvents", "createTeamsMeeting"],
      }).conference,
    ).toBe("teams");
    expect(
      syncCalendarToBrowser(providerCalendar(), {
        provider: "microsoft",
        capabilities: ["readEvents", "writeEvents"],
      }).conference,
    ).toBe("none");
    expect(
      syncCalendarToBrowser(providerCalendar(), { provider: "apple" })
        .conference,
    ).toBe("none");
  });

  it("exposes conferenceKinds on calendar capabilities", () => {
    expect(
      syncCalendarToBrowser(providerCalendar(), {
        provider: "microsoft",
        capabilities: ["readEvents", "writeEvents", "createTeamsMeeting"],
      }).capabilities.conferenceKinds,
    ).toEqual(["teams"]);
    expect(
      syncCalendarToBrowser(providerCalendar({ createsGoogleMeet: false }), {
        provider: "microsoft",
        capabilities: ["readEvents", "writeEvents", "createTeamsMeeting"],
      }).capabilities.conferenceKinds,
    ).toEqual([]);
  });
});
