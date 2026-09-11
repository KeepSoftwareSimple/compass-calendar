import {
  hasScope,
  parseArgs,
  pickSmokeCalendar,
} from "@scripts/commands/microsoft-mint-refresh-token";
import { type DiscoveredCalendar } from "@sync/providers/provider-calendar.port";
import { describe, expect, it } from "bun:test";

function capabilities(canWriteEvents: boolean) {
  return {
    canReadEvents: true,
    canWriteEvents,
    canReadBusy: true,
    canInviteAttendees: canWriteEvents,
  };
}

function calendar(
  overrides: Partial<DiscoveredCalendar> & { displayName: string },
): DiscoveredCalendar {
  return {
    providerCalendarId: `id-${overrides.displayName}`,
    color: null,
    eventLabels: [],
    primary: false,
    active: true,
    accessRole: "owner",
    capabilities: capabilities(true),
    createsGoogleMeet: false,
    ...overrides,
  };
}

describe("microsoft-mint-refresh-token args", () => {
  it("defaults repo to null and environment to provider-smoke", () => {
    expect(parseArgs([])).toEqual({
      repo: null,
      environment: "provider-smoke",
      redirectUri: "http://localhost:3010/sync/microsoft",
      printOnly: false,
    });
  });

  it("reads every flag", () => {
    expect(
      parseArgs([
        "--repo",
        "acme/app",
        "--env",
        "smoke",
        "--redirect-uri",
        "http://localhost:9080/auth/microsoft/callback",
        "--print-only",
      ]),
    ).toEqual({
      repo: "acme/app",
      environment: "smoke",
      redirectUri: "http://localhost:9080/auth/microsoft/callback",
      printOnly: true,
    });
  });
});

describe("pickSmokeCalendar", () => {
  it("picks only a writable, active calendar named compass-smoke", () => {
    const calendars = [
      calendar({ displayName: "Calendar" }),
      calendar({
        displayName: "compass-smoke",
        capabilities: capabilities(false),
      }),
      calendar({ displayName: "compass-smoke", active: false }),
      calendar({ displayName: "compass-smoke", providerCalendarId: "good" }),
    ];
    expect(pickSmokeCalendar(calendars)?.providerCalendarId).toBe("good");
    expect(pickSmokeCalendar([calendar({ displayName: "Work" })])).toBe(
      undefined,
    );
  });
});

describe("hasScope", () => {
  it("accepts bare and resource-prefixed scopes without matching suffixes", () => {
    expect(hasScope(["Calendars.ReadWrite"], "Calendars.ReadWrite")).toBe(true);
    expect(
      hasScope(
        ["https://graph.microsoft.com/Calendars.ReadWrite"],
        "Calendars.ReadWrite",
      ),
    ).toBe(true);
    expect(hasScope(["Calendars.Read"], "Calendars.ReadWrite")).toBe(false);
    expect(
      hasScope(["Calendars.ReadWrite.Shared"], "Calendars.ReadWrite"),
    ).toBe(false);
  });
});
