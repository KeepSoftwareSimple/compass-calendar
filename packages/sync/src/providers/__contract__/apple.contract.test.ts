import {
  type AuthContractCapabilities,
  type AuthContractCase,
  OAUTH_AUTH_CONTRACT_CASES,
} from "@sync/providers/__contract__/auth.contract";
import { type DiscoveryContractCase } from "@sync/providers/__contract__/discovery.contract";
import { type NormalizerContractCase } from "@sync/providers/__contract__/normalizer.contract";
import { AppleAuthAdapter } from "@sync/providers/apple/apple-auth.adapter";
import { AppleCalendarAdapter } from "@sync/providers/apple/apple-calendar.adapter";
import { normalizeAppleEventResource } from "@sync/providers/apple/apple-event.normalizer";
import {
  type CaldavFetch,
  createCaldavClient,
} from "@sync/providers/apple/caldav-client";
import { type ProviderAuthAdapter } from "@sync/providers/provider-auth.port";

const PRINCIPAL_XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/</D:href>
    <D:propstat>
      <D:prop>
        <D:current-user-principal>
          <D:href>/123456789/principal/</D:href>
        </D:current-user-principal>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

const HOME_SET_XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/123456789/principal/</D:href>
    <D:propstat>
      <D:prop>
        <D:calendar-home-set>
          <D:href>/123456789/calendars/</D:href>
        </D:calendar-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

const CALENDARS_XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:ICAL="http://apple.com/ns/ical/">
  <D:response>
    <D:href>/123456789/calendars/home/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>user</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <ICAL:calendar-color>#AABBCCFF</ICAL:calendar-color>
        <D:current-user-privilege-set>
          <D:privilege><D:write/></D:privilege>
        </D:current-user-privilege-set>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/123456789/calendars/work/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Work</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:current-user-privilege-set>
          <D:privilege><D:read/></D:privilege>
        </D:current-user-privilege-set>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 207,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

function discoveryFetch(): CaldavFetch {
  const handlers = [
    () => xmlResponse(PRINCIPAL_XML),
    () => xmlResponse(HOME_SET_XML),
    () => xmlResponse(CALENDARS_XML),
  ];
  let call = 0;
  return async () => {
    const handler = handlers[call];
    call += 1;
    if (!handler) throw new Error("unexpected discovery request");
    return handler();
  };
}

const APPLE_DISCOVERY_CASES: DiscoveryContractCase[] = [
  {
    name: "detects the account-default calendar as primary",
    username: "user@icloud.com",
    password: "secret",
    run: async (adapter) => {
      const result = await adapter.discoverCalendars({
        accessToken: "secret",
      });
      expect(
        result.calendars.find((calendar) => calendar.primary)?.displayName,
      ).toBe("user");
    },
  },
  {
    name: "maps calendar colors and access roles",
    username: "user@icloud.com",
    password: "secret",
    run: async (adapter) => {
      const result = await adapter.discoverCalendars({
        accessToken: "secret",
      });
      expect(result.calendars[0]?.color).toBe("#AABBCC");
      expect(result.calendars[0]?.accessRole).toBe("editor");
      expect(result.calendars[1]?.accessRole).toBe("viewer");
    },
  },
  {
    name: "returns a null incremental cursor",
    username: "user@icloud.com",
    password: "secret",
    run: async (adapter) => {
      const result = await adapter.discoverCalendars({
        accessToken: "secret",
      });
      expect(result.cursor).toBeNull();
    },
  },
];

describe("apple discovery contract", () => {
  for (const testCase of APPLE_DISCOVERY_CASES) {
    it(testCase.name, async () => {
      const adapter = new AppleCalendarAdapter(
        "user@icloud.com",
        (username, password) =>
          createCaldavClient({ username, password }, discoveryFetch()),
      );
      await testCase.run(adapter);
    });
  }
});

describeOAuthAuthContract(
  "apple",
  { oauthRedirect: false },
  OAUTH_AUTH_CONTRACT_CASES,
  () => new AppleAuthAdapter(),
);

function describeOAuthAuthContract(
  label: string,
  capabilities: AuthContractCapabilities,
  cases: AuthContractCase[],
  factory: () => ProviderAuthAdapter,
): void {
  describe(`${label} oauth auth contract`, () => {
    for (const testCase of cases) {
      if (!capabilities[testCase.requires]) {
        it(`${testCase.name} [not applicable: ${testCase.requires} unsupported]`, () => {
          expect(capabilities[testCase.requires]).toBe(false);
        });
        continue;
      }
      it(testCase.name, async () => {
        await testCase.run(factory());
      });
    }
  });
}

const APPLE_NORMALIZER_CASES: NormalizerContractCase[] = [
  {
    name: "normalizes a timed master to a single event read",
    input: {
      ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:contract-timed@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
SUMMARY:Contract timed
END:VEVENT
END:VCALENDAR`,
      href: "/calendars/home/contract-timed.ics",
      etag: '"contract-etag"',
      connectionTimeZone: "UTC",
    },
    run: (reads) => {
      expect(reads).toHaveLength(1);
      expect(reads[0]?.kind).toBe("event");
      if (reads[0]?.kind !== "event") return;
      expect(reads[0].providerEventId).toBe("contract-timed@icloud.com");
      expect(reads[0].providerVersion).toBe('"contract-etag"');
      expect(reads[0].recurrence).toEqual({ kind: "single" });
    },
  },
  {
    name: "normalizes a recurring master and one exception",
    input: {
      ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:contract-series@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Contract series
END:VEVENT
BEGIN:VEVENT
UID:contract-series@icloud.com
DTSTAMP:20250101T120001Z
DTSTART:20250116T100000Z
DTEND:20250116T110000Z
RECURRENCE-ID:20250116T090000Z
SUMMARY:Contract exception
END:VEVENT
END:VCALENDAR`,
      href: "/calendars/home/contract-series.ics",
      etag: '"contract-series-etag"',
      connectionTimeZone: "UTC",
    },
    run: (reads) => {
      expect(reads).toHaveLength(2);
      const master = reads[0];
      expect(master?.kind).toBe("event");
      if (master?.kind === "event") {
        expect(master.recurrence).toEqual({
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=DAILY;COUNT=3"],
        });
      }
      expect(reads[1]?.kind).toBe("event");
      if (reads[1]?.kind !== "event") return;
      expect(reads[1].recurrence.kind).toBe("instance");
    },
  },
];

describe("apple normalizer contract", () => {
  for (const testCase of APPLE_NORMALIZER_CASES) {
    it(testCase.name, async () => {
      const reads = normalizeAppleEventResource(testCase.input);
      await testCase.run(reads);
    });
  }
});
