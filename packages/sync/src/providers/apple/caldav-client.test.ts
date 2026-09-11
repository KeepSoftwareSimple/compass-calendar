import {
  CaldavClientError,
  type CaldavFetch,
  createCaldavClient,
  discoverCalendars,
  stripAppleColorAlpha,
} from "@sync/providers/apple/caldav-client";

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
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:ICAL="http://apple.com/ns/ical/" xmlns:CS="http://calendarserver.org/ns/">
  <D:response>
    <D:href>/123456789/calendars/</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/123456789/calendars/home/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>home</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <ICAL:calendar-color>#FFCC00FF</ICAL:calendar-color>
        <D:current-user-privilege-set>
          <D:privilege><D:write/></D:privilege>
          <D:privilege><D:read/></D:privilege>
        </D:current-user-privilege-set>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>
        <CS:getctag>ctag-home</CS:getctag>
        <D:sync-token>sync-home</D:sync-token>
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
        <ICAL:calendar-color>#336699FF</ICAL:calendar-color>
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
  <D:response>
    <D:href>/123456789/calendars/inbox/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Inbox</D:displayname>
        <D:resourcetype><D:collection/><C:schedule-inbox/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

function scriptedFetch(
  handlers: Array<
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): CaldavFetch {
  let call = 0;
  return async (url, init) => {
    const handler = handlers[call];
    if (!handler) {
      throw new Error(`No handler scripted for request ${call} to ${url}`);
    }
    call += 1;
    return handler(String(url), init);
  };
}

function xmlResponse(body: string, status = 207): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

describe("caldav-client", () => {
  it("discovers principal, home, and writable calendars", async () => {
    const fetchImpl = scriptedFetch([
      () => xmlResponse(PRINCIPAL_XML),
      () => xmlResponse(HOME_SET_XML),
      () => xmlResponse(CALENDARS_XML),
    ]);
    const client = createCaldavClient(
      { username: "user@icloud.com", password: "app-specific" },
      fetchImpl,
    );

    const calendars = await discoverCalendars(client, {
      username: "user@icloud.com",
      password: "app-specific",
    });

    expect(calendars).toHaveLength(2);
    expect(calendars.map((calendar) => calendar.displayName)).toEqual([
      "home",
      "Work",
    ]);
    expect(calendars[0]?.writable).toBe(true);
    expect(calendars[0]?.color).toBe("#FFCC00");
    expect(calendars[1]?.writable).toBe(false);
  });

  it("follows a partition redirect before replaying the request", async () => {
    const fetchImpl = scriptedFetch([
      () =>
        new Response("", {
          status: 301,
          headers: {
            Location: "https://p42-caldav.icloud.com/",
          },
        }),
      () => xmlResponse(PRINCIPAL_XML),
      () => xmlResponse(HOME_SET_XML),
      () => xmlResponse(CALENDARS_XML),
    ]);
    const client = createCaldavClient(
      { username: "user@icloud.com", password: "secret" },
      fetchImpl,
    );

    await discoverCalendars(client, {
      username: "user@icloud.com",
      password: "secret",
    });
  });

  it("maps 401 to authExpired", async () => {
    const fetchImpl = scriptedFetch([() => new Response("", { status: 401 })]);
    const client = createCaldavClient(
      { username: "user@icloud.com", password: "wrong" },
      fetchImpl,
    );

    await expect(
      discoverCalendars(client, {
        username: "user@icloud.com",
        password: "wrong",
      }),
    ).rejects.toMatchObject({ reason: "authExpired" });
  });

  it("maps 503 to transient", async () => {
    const fetchImpl = scriptedFetch([() => new Response("", { status: 503 })]);
    const client = createCaldavClient(
      { username: "user@icloud.com", password: "secret" },
      fetchImpl,
    );

    await expect(
      discoverCalendars(client, {
        username: "user@icloud.com",
        password: "secret",
      }),
    ).rejects.toMatchObject({ reason: "transient" });
  });

  it("redacts Authorization from thrown errors", async () => {
    const fetchImpl = async () => {
      throw new Error("network failed with Authorization: Basic c2VjcmV0");
    };
    const client = createCaldavClient(
      { username: "user@icloud.com", password: "secret" },
      fetchImpl,
    );

    try {
      await client.propfind("https://caldav.icloud.com/", ["displayname"], 0);
      throw new Error("expected propfind to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CaldavClientError);
      expect(String(error)).not.toContain("Basic c2VjcmV0");
    }
  });

  it("skips VTODO-only collections such as Reminders", async () => {
    const remindersOnlyXml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/123456789/calendars/reminders/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Reminders</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <C:supported-calendar-component-set>
          <C:comp name="VTODO"/>
        </C:supported-calendar-component-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
    const fetchImpl = scriptedFetch([
      () => xmlResponse(PRINCIPAL_XML),
      () => xmlResponse(HOME_SET_XML),
      () => xmlResponse(remindersOnlyXml),
    ]);
    const client = createCaldavClient(
      { username: "user@icloud.com", password: "secret" },
      fetchImpl,
    );

    const calendars = await discoverCalendars(client, {
      username: "user@icloud.com",
      password: "secret",
    });

    expect(calendars).toEqual([]);
  });

  it("supports put, delete, get, and report helpers", async () => {
    const fetchImpl = scriptedFetch([
      () =>
        new Response("", {
          status: 200,
          headers: { etag: '"etag-1"' },
        }),
      () => new Response("", { status: 204 }),
      () => new Response("BEGIN:VCALENDAR", { status: 200 }),
      () => xmlResponse("<multistatus/>"),
    ]);
    const client = createCaldavClient(
      { username: "user@icloud.com", password: "secret" },
      fetchImpl,
    );

    const put = await client.put("https://caldav.icloud.com/event.ics", "ICS", {
      ifMatch: '"etag-1"',
    });
    expect(put.status).toBe(200);
    expect(put.headers["etag"]).toBe('"etag-1"');

    const del = await client.delete(
      "https://caldav.icloud.com/event.ics",
      '"etag-1"',
    );
    expect(del.status).toBe(204);

    const get = await client.get("https://caldav.icloud.com/event.ics");
    expect(get.body).toBe("BEGIN:VCALENDAR");

    const report = await client.report(
      "https://caldav.icloud.com/",
      "<report/>",
      1,
    );
    expect(report.status).toBe(207);
  });
});

describe("stripAppleColorAlpha", () => {
  it("strips the alpha channel from Apple calendar colors", () => {
    expect(stripAppleColorAlpha("#FFCC00FF")).toBe("#FFCC00");
    expect(stripAppleColorAlpha("#336699")).toBe("#336699");
    expect(stripAppleColorAlpha(null)).toBeNull();
  });
});
