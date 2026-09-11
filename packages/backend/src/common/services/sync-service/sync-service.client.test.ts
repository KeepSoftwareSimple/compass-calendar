import { faker } from "@faker-js/faker";
import {
  decryptAdoptAuthorizationCredential,
  decryptInternalCredential,
} from "@core/security/internal-credential-envelope";
import { type CalendarId, type EventId } from "@core/types/domain-primitives";
import { type BusyAvailabilityRequest } from "@core/types/sync/availability.contracts";
import { type ChangeFeedCursor } from "@core/types/sync/change-feed.contracts";
import { type CommandSubmitRequest } from "@core/types/sync/command.contracts";
import { type EventInstanceListQuery } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type IdempotencyKey,
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  verifyInternalRequest,
  verifyServiceRequest,
} from "@sync/auth/internal-auth";
import {
  CHANGES_ALL_PATH,
  CHANGES_PATH,
} from "@sync/server/change-feed.routes";
import { COMMANDS_PATH } from "@sync/server/command.routes";
import {
  ADOPT_AUTHORIZATION_PATH,
  ADOPT_GOOGLE_AUTHORIZATION_PATH,
  AVAILABILITY_BUSY_PATH,
  BEGIN_PATH,
  CALENDARS_PATH,
  CONNECTIONS_PATH,
  EVENTS_FULL_PATH,
  FOREGROUND_REFRESH_PATH,
} from "@sync/server/connection.routes";
import { CONTACTS_SUGGESTIONS_PATH } from "@sync/server/contacts.routes";
import { PRINCIPAL_PATH } from "@sync/server/principal.routes";
import {
  SyncServiceClient,
  type SyncServiceClientOptions,
} from "./sync-service.client";

const objectId = () => faker.database.mongodbObjectId();
const SECRET = "shared-internal-secret";
const NOW = 1_800_000_000_000;
const BASE_URL = "http://sync.internal:3010";

// Records the last request the client made, so a test can inspect the signed
// headers, and returns a scripted response.
interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const fakeFetch = (
  responder: (captured: Captured) => Promise<{
    status: number;
    json: () => Promise<unknown>;
    headers?: { get: (name: string) => string | null };
  }>,
) => {
  const calls: Captured[] = [];
  const fn: SyncServiceClientOptions["fetch"] = async (url, init) => {
    const captured: Captured = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    };
    calls.push(captured);
    return responder(captured);
  };
  return { fn, calls };
};

const client = (fetchFn: SyncServiceClientOptions["fetch"]) =>
  new SyncServiceClient({
    baseUrl: BASE_URL,
    secret: SECRET,
    timeoutMs: 20,
    fetch: fetchFn,
    now: () => NOW,
    newCorrelationId: () => "corr-1",
  });

const principal = () => ({
  tenantId: objectId() as TenantId,
  principalId: objectId() as PrincipalId,
});

// A minimal Headers stand-in that answers the one header the client reads.
const contentType = (value: string) => ({
  get: (name: string) => (name.toLowerCase() === "content-type" ? value : null),
});

const request = (calendarIds: string[]): BusyAvailabilityRequest => ({
  calendarIds: calendarIds as BusyAvailabilityRequest["calendarIds"],
  start: "2026-07-14T09:00:00.000Z" as BusyAvailabilityRequest["start"],
  end: "2026-07-14T17:00:00.000Z" as BusyAvailabilityRequest["end"],
  maxAgeMs: 900_000,
  purpose: "booking_confirmation",
});

const okBody = () => ({
  intervals: [
    { start: "2026-07-14T09:00:00.000Z", end: "2026-07-14T10:00:00.000Z" },
  ],
  computedAt: "2026-07-14T12:00:00.000Z",
  connections: [],
  complete: true,
  issues: [],
  bookable: true,
});

describe("SyncServiceClient", () => {
  it("signs a request the real Sync verifier accepts, and returns the parsed body", async () => {
    const who = principal();
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => okBody(),
    }));

    const result = await client(fn).queryBusyAvailability(
      who,
      request([objectId()]),
    );

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.bookable).toBe(true);
    expect(result.value.intervals).toHaveLength(1);

    // The URL and method are correct.
    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${AVAILABILITY_BUSY_PATH}`);
    expect(sent?.method).toBe("POST");

    // The signed headers verify against the real Sync internal-auth verifier,
    // for the same principal — cross-service auth compatibility.
    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("lists connections with a signed GET the real Sync verifier accepts", async () => {
    const who = principal();
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ connections: [] }),
    }));

    const result = await client(fn).listConnections(who);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.connections).toEqual([]);

    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${CONNECTIONS_PATH}`);
    expect(sent?.method).toBe("GET");
    expect(sent?.body).toBeUndefined();

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("purges a principal with a signed DELETE the real Sync verifier accepts", async () => {
    const who = principal();
    const counts = {
      connections: 1,
      credentials: 1,
      calendars: 0,
      events: 0,
      eventOccurrences: 0,
      syncResources: 0,
      commands: 0,
      jobs: 0,
      deletionMarkers: 0,
      invalidations: 0,
    };
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => counts,
    }));

    const result = await client(fn).purgePrincipal(who);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value).toEqual(counts);

    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${PRINCIPAL_PATH}`);
    expect(sent?.method).toBe("DELETE");
    expect(sent?.body).toBeUndefined();

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("disconnects one connection with a signed DELETE the real Sync verifier accepts", async () => {
    const who = principal();
    const connectionId = "64b7f9c2e1a2b3c4d5e6f7ff" as ConnectionId;
    // Sync answers 204 with an empty body; reading it as JSON would throw.
    const { fn, calls } = fakeFetch(async () => ({
      status: 204,
      json: async () => {
        throw new Error("204 has no body");
      },
    }));

    const result = await client(fn).disconnectConnection(who, connectionId);

    expect(result.ok).toBe(true);

    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}/internal/connections/${connectionId}`);
    expect(sent?.method).toBe("DELETE");

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    // Sync scopes the disconnect to the signed principal, so a foreign
    // connection id can never be disconnected through this client.
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("reports a disconnect of an unknown connection as notFound", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 404,
      json: async () => ({ error: "not_found" }),
    }));

    const result = await client(fn).disconnectConnection(
      principal(),
      "64b7f9c2e1a2b3c4d5e6f7ff",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("notFound");
  });

  it("maps a 409 (passive-mode refusal) to conflict", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 409,
      json: async () => ({ error: "passive_mode" }),
    }));

    const result = await client(fn).beginConnection(principal());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("conflict");
  });

  it("lists calendars with a signed GET the real Sync verifier accepts", async () => {
    const who = principal();
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ calendars: [] }),
    }));

    const result = await client(fn).listCalendars(who);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.calendars).toEqual([]);

    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${CALENDARS_PATH}`);
    expect(sent?.method).toBe("GET");
    expect(sent?.body).toBeUndefined();

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("lists active-only calendars with ?activeOnly=true when the option is set", async () => {
    const who = principal();
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ calendars: [] }),
    }));

    const result = await client(fn).listCalendars(who, { activeOnly: true });

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.calendars).toEqual([]);

    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${CALENDARS_PATH}?activeOnly=true`);
    expect(sent?.method).toBe("GET");

    // The default call, through the same client, still sends no params —
    // one call's option must not leak a query onto the next.
    await client(fn).listCalendars(who);
    expect(calls[1]?.url).toBe(`${BASE_URL}${CALENDARS_PATH}`);

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("fetches contact suggestions with a signed GET the real Sync verifier accepts", async () => {
    const who = principal();
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({
        suggestions: [{ email: "ada@example.com", displayName: "Ada" }],
      }),
    }));

    const result = await client(fn).getContactSuggestions(who, "ad a");

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.suggestions).toEqual([
      { email: "ada@example.com", displayName: "Ada" },
    ]);

    const sent = calls[0];
    // Path contract with the Sync route module, query URL-encoded.
    expect(sent?.url).toBe(`${BASE_URL}${CONTACTS_SUGGESTIONS_PATH}?q=ad+a`);
    expect(sent?.method).toBe("GET");

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("rejects a contact-suggestions body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({
        // People-shaped extras must never ride through the strict contract.
        suggestions: [
          {
            email: "ada@example.com",
            displayName: "Ada",
            phoneNumbers: ["+1"],
          },
        ],
      }),
    }));

    const result = await client(fn).getContactSuggestions(principal(), "ada");
    if (result.ok) throw new Error("expected invalidResponse");
    expect(result.error.kind).toBe("invalidResponse");
  });

  it("maps a 403 contacts refusal to unexpectedStatus with the status attached", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 403,
      json: async () => ({ error: "contacts_not_granted" }),
    }));

    const result = await client(fn).getContactSuggestions(principal(), "ada");
    if (result.ok) throw new Error("expected a failure");
    expect(result.error.kind).toBe("unexpectedStatus");
    expect(result.error.status).toBe(403);
  });

  it("polls the change feed from now and with a resume cursor", async () => {
    const who = principal();
    const cursor = objectId() as ChangeFeedCursor;
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({
        kind: "ok",
        invalidations: [],
        nextCursor: cursor,
      }),
    }));

    const fromNow = await client(fn).getChanges(who, null);
    if (!fromNow.ok) throw new Error(`expected ok, got ${fromNow.error.kind}`);
    expect(fromNow.value).toEqual({
      kind: "ok",
      invalidations: [],
      nextCursor: cursor,
    });
    expect(calls[0]?.url).toBe(`${BASE_URL}${CHANGES_PATH}`);
    expect(calls[0]?.method).toBe("GET");

    const resumed = await client(fn).getChanges(who, cursor as never);
    if (!resumed.ok) throw new Error(`expected ok, got ${resumed.error.kind}`);
    expect(calls[1]?.url).toBe(
      `${BASE_URL}${CHANGES_PATH}?cursor=${encodeURIComponent(cursor)}`,
    );

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: calls[0]?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
  });

  it("polls the GLOBAL change feed with no principal, signed as the service", async () => {
    const cursor = objectId();
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({
        kind: "ok",
        invalidations: [
          {
            invalidation: {
              kind: "connection",
              connectionId: objectId() as ConnectionId,
            },
            emittedAt: "2026-07-30T00:00:00.000Z",
            tenantId: objectId() as TenantId,
            principalId: objectId() as PrincipalId,
          },
        ],
        nextCursor: cursor,
      }),
    }));

    const fromNow = await client(fn).getGlobalChanges(null);
    if (!fromNow.ok) throw new Error(`expected ok, got ${fromNow.error.kind}`);
    expect(fromNow.value.kind).toBe("ok");
    expect(calls[0]?.url).toBe(`${BASE_URL}${CHANGES_ALL_PATH}`);
    expect(calls[0]?.method).toBe("GET");

    await client(fn).getGlobalChanges(cursor as never);
    expect(calls[1]?.url).toBe(
      `${BASE_URL}${CHANGES_ALL_PATH}?cursor=${encodeURIComponent(cursor)}`,
    );

    // No tenant/principal headers at all — the real Sync service-auth
    // verifier accepts it on that basis alone.
    expect(calls[0]?.headers).not.toHaveProperty("x-sync-tenant");
    expect(calls[0]?.headers).not.toHaveProperty("x-sync-principal");
    const verdict = verifyServiceRequest({
      secret: SECRET,
      headers: calls[0]?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);

    // And the per-principal verifier must NOT accept it (missing identity).
    expect(
      verifyInternalRequest({
        secret: SECRET,
        headers: calls[0]?.headers ?? {},
        now: NOW,
      }).ok,
    ).toBe(false);
  });

  it("rejects a global-changes body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ kind: "ok", invalidations: [{ bogus: true }] }),
    }));

    const result = await client(fn).getGlobalChanges(null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalidResponse");
  });

  it("rejects a calendars body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ calendars: [{ bogus: true }] }),
    }));

    const result = await client(fn).listCalendars(principal());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalidResponse");
  });

  it("rejects a connections body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ connections: [{ bogus: true }] }),
    }));

    const result = await client(fn).listConnections(principal());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalidResponse");
  });

  // The whole point of the invalidResponse fix: a reader must be able to see
  // which field broke the contract, not just that it broke.
  it("names the field a rejected 200 body broke, plus the body shape", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      headers: contentType("application/json"),
      // A field Sync adds during a rolling deploy that the strict schema rejects.
      json: async () => ({ connections: [], addedByNewerSync: true }),
    }));

    const result = await client(fn).listConnections(principal());

    if (result.ok) throw new Error("expected invalidResponse");
    expect(result.error.detail).toContain("unrecognized_keys");
    expect(result.error.detail).toContain("addedByNewerSync");
    expect(result.error.detail).toContain("content-type=application/json");
  });

  // A 200 whose body is not JSON at all — HTML the reverse proxy returned in
  // front of Sync. The content-type is what tells the two apart.
  it("reports the content-type when a 200 body is not JSON", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      headers: contentType("text/html"),
      json: async () => {
        throw new Error("not json");
      },
    }));

    const result = await client(fn).listConnections(principal());

    if (result.ok) throw new Error("expected invalidResponse");
    expect(result.error.kind).toBe("invalidResponse");
    expect(result.error.detail).toContain("body is not JSON");
    expect(result.error.detail).toContain("content-type=text/html");
  });

  // A 200 with the correct content-type whose body still fails to parse: the
  // reverse-proxy theory above doesn't apply, so the parse error's own
  // name/message is the only way to tell a genuinely malformed body (a
  // SyntaxError from response.json()'s internal JSON.parse) apart from a body
  // stream that failed mid-read (e.g. a connection reset while Sync was still
  // writing the response). Discarding that error, as the code did before,
  // reproduces the same uninformative "body is not JSON" message for both.
  it("carries the parse error's name and message when a 200 application/json body is not JSON", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      headers: contentType("application/json"),
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    }));

    const result = await client(fn).listConnections(principal());

    if (result.ok) throw new Error("expected invalidResponse");
    expect(result.error.kind).toBe("invalidResponse");
    expect(result.error.detail).toContain(
      "SyntaxError: Unexpected end of JSON input",
    );
    expect(result.error.detail).toContain("content-type=application/json");
  });

  // A body-stream failure (connection reset mid-read) throws a different
  // error shape than a JSON syntax error. The detail must distinguish them,
  // not flatten both into the same "body is not JSON" message.
  it("distinguishes a body-stream failure from a JSON syntax error", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      headers: contentType("application/json"),
      json: async () => {
        throw new TypeError("terminated");
      },
    }));

    const result = await client(fn).listConnections(principal());

    if (result.ok) throw new Error("expected invalidResponse");
    expect(result.error.detail).toContain("TypeError: terminated");
    expect(result.error.detail).not.toContain("SyntaxError");
  });

  it("lists full events with a signed GET the real Sync verifier accepts", async () => {
    const who = principal();
    const calendarA = objectId() as CalendarId;
    const calendarB = objectId() as CalendarId;
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ instances: [], nextCursor: null }),
    }));

    const result = await client(fn).listFullEvents(who, {
      calendarIds: [
        calendarA,
        calendarB,
      ] as EventInstanceListQuery["calendarIds"],
      start: "2026-07-14T09:00:00.000Z" as EventInstanceListQuery["start"],
      end: "2026-07-14T17:00:00.000Z" as EventInstanceListQuery["end"],
      limit: 100,
    });

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.instances).toEqual([]);

    const sent = calls[0];
    expect(sent?.method).toBe("GET");
    expect(sent?.body).toBeUndefined();
    // Path parity with the Sync full-event route + repeated calendarIds params.
    expect(sent?.url.startsWith(`${BASE_URL}${EVENTS_FULL_PATH}?`)).toBe(true);
    const query = new URL(sent?.url ?? "").searchParams;
    expect(query.getAll("calendarIds")).toEqual([calendarA, calendarB]);
    expect(query.get("limit")).toBe("100");

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("rejects a full-event body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ instances: [{ bogus: true }], nextCursor: null }),
    }));

    const result = await client(fn).listFullEvents(principal(), {
      calendarIds: [
        objectId() as CalendarId,
      ] as EventInstanceListQuery["calendarIds"],
      start: "2026-07-14T09:00:00.000Z" as EventInstanceListQuery["start"],
      end: "2026-07-14T17:00:00.000Z" as EventInstanceListQuery["end"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalidResponse");
  });

  it("submits a command with a signed POST the real Sync verifier accepts", async () => {
    const who = principal();
    const eventId = objectId() as EventId;
    const submitRequest = {
      idempotencyKey: "client-generated-key-1" as IdempotencyKey,
      eventId: eventId,
      input: { kind: "move", calendarId: objectId() as CalendarId },
      expectedVersion: null,
    } as CommandSubmitRequest;
    // A minimal valid command envelope the Sync service would return.
    const commandBody = {
      id: objectId(),
      tenantId: who.tenantId,
      principalId: who.principalId,
      idempotencyKey: "client-generated-key-1",
      eventId,
      input: submitRequest.input,
      expectedVersion: null,
      outcome: { state: "pending" },
      attemptCount: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ command: commandBody }),
    }));

    const result = await client(fn).submitCommand(who, submitRequest);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.command.outcome.state).toBe("pending");
    expect(result.value.command.eventId).toBe(eventId);

    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${COMMANDS_PATH}`);
    expect(sent?.method).toBe("POST");
    // The body is the request verbatim: tenant/principal are signed, never sent.
    const body = JSON.parse(sent?.body ?? "{}");
    expect(body.idempotencyKey).toBe("client-generated-key-1");
    expect(body.input.kind).toBe("move");
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("principalId");

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.tenantId).toBe(who.tenantId as TenantId);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("rejects a command-submit body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ command: { bogus: true } }),
    }));

    const result = await client(fn).submitCommand(principal(), {
      idempotencyKey: "client-generated-key-2" as IdempotencyKey,
      eventId: objectId() as EventId,
      input: { kind: "move", calendarId: objectId() as CalendarId },
      expectedVersion: null,
    } as CommandSubmitRequest);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalidResponse");
  });

  it("maps a 400 command rejection to badRequest without throwing", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 400,
      json: async () => ({ error: "invalid_command" }),
    }));

    const result = await client(fn).submitCommand(principal(), {
      idempotencyKey: "client-generated-key-3" as IdempotencyKey,
      eventId: objectId() as EventId,
      input: { kind: "move", calendarId: objectId() as CalendarId },
      expectedVersion: null,
    } as CommandSubmitRequest);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("badRequest");
  });

  it("begins a connection with a signed POST the real Sync verifier accepts", async () => {
    const who = principal();
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({
        authorizationUrl:
          "https://accounts.google.com/o/oauth2/v2/auth?state=x",
      }),
    }));

    const result = await client(fn).beginConnection(who);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    if (!("authorizationUrl" in result.value)) {
      throw new Error("expected a redirect begin response");
    }
    expect(result.value.authorizationUrl).toContain("accounts.google.com");

    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${BEGIN_PATH}`);
    expect(sent?.method).toBe("POST");
    // No connectionId given: a fresh connection sends an empty body.
    expect(JSON.parse(sent?.body ?? "{}")).toEqual({});

    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("sends foreground principals in one service-authenticated batch", async () => {
    const principalIds = [objectId(), objectId()];
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ enqueued: 1, inFlight: 0, resources: 2 }),
    }));

    const result = await client(fn).refreshForegroundConnections(
      principalIds as never,
    );

    expect(result.ok).toBe(true);
    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${FOREGROUND_REFRESH_PATH}`);
    expect(JSON.parse(sent?.body ?? "{}")).toEqual({ principalIds });
    expect(
      verifyServiceRequest({
        secret: SECRET,
        headers: sent?.headers ?? {},
        now: NOW,
      }).ok,
    ).toBe(true);
  });

  it("adopts a server-exchanged Google authorization with a signed POST", async () => {
    const who = principal();
    const request = {
      account: {
        providerAccountId: "google-sub-1" as ProviderAccountId,
        email: "connected@example.com",
        displayName: "Connected User",
      },
      refreshToken: "server-exchanged-refresh-token",
      grantedScopes: ["https://www.googleapis.com/auth/calendar.events"],
    };
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({}),
    }));

    const result = await client(fn).adoptGoogleAuthorization(who, request);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value).toEqual({});
    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${ADOPT_GOOGLE_AUTHORIZATION_PATH}`);
    expect(sent?.method).toBe("POST");
    const body = JSON.parse(sent?.body ?? "") as {
      account: unknown;
      credential: unknown;
      grantedScopes: unknown;
    };
    expect(body.account).toEqual(request.account);
    expect(body.grantedScopes).toEqual(request.grantedScopes);
    expect(JSON.stringify(body)).not.toContain(request.refreshToken);
    expect(
      decryptInternalCredential(SECRET, body.credential as never, {
        tenantId: who.tenantId,
        principalId: who.principalId,
        account: request.account,
        grantedScopes: request.grantedScopes,
      }),
    ).toBe(request.refreshToken);
    const verdict = verifyInternalRequest({
      secret: SECRET,
      headers: sent?.headers ?? {},
      now: NOW,
    });
    if (!verdict.ok) throw new Error(`verify failed: ${verdict.reason}`);
    expect(verdict.context.principalId).toBe(who.principalId as PrincipalId);
  });

  it("adopts a server-exchanged Microsoft authorization on the provider-neutral path", async () => {
    const who = principal();
    const request = {
      provider: "microsoft" as const,
      account: {
        providerAccountId: "ms-oid-1" as ProviderAccountId,
        email: "connected@example.com",
        displayName: "Connected User",
      },
      refreshToken: "microsoft-refresh-token",
      grantedScopes: ["Calendars.ReadWrite"],
    };
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({}),
    }));

    const result = await client(fn).adoptProviderAuthorization(who, request);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value).toEqual({});
    const sent = calls[0];
    expect(sent?.url).toBe(`${BASE_URL}${ADOPT_AUTHORIZATION_PATH}`);
    expect(sent?.method).toBe("POST");
    const body = JSON.parse(sent?.body ?? "") as {
      provider: unknown;
      account: unknown;
      credential: unknown;
      grantedScopes: unknown;
    };
    expect(body.provider).toBe("microsoft");
    expect(body.account).toEqual(request.account);
    expect(body.grantedScopes).toEqual(request.grantedScopes);
    expect(JSON.stringify(body)).not.toContain(request.refreshToken);
    expect(
      decryptAdoptAuthorizationCredential(SECRET, body.credential as never, {
        tenantId: who.tenantId,
        principalId: who.principalId,
        provider: "microsoft",
        account: request.account,
        grantedScopes: request.grantedScopes,
      }),
    ).toBe(request.refreshToken);
  });

  it("forwards a connectionId for reconnect", async () => {
    const { fn, calls } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      }),
    }));

    const connectionId = objectId() as ConnectionId;
    await client(fn).beginConnection(principal(), {
      connectionId: connectionId,
    });

    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ connectionId });
  });

  it("rejects a begin body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ authorizationUrl: "not-a-url" }),
    }));

    const result = await client(fn).beginConnection(principal());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalidResponse");
  });

  it("maps a 401 to an unauthorized error", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    }));

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    expect(result).toEqual({
      ok: false,
      error: { kind: "unauthorized", status: 401, correlationId: "corr-1" },
    });
  });

  it("maps a 400 to a badRequest error", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 400,
      json: async () => ({ error: "invalid_query" }),
    }));

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("badRequest");
  });

  it("maps a 503 to unavailable", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 503,
      json: async () => ({ error: "not_ready" }),
    }));

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unavailable");
  });

  it("maps a 429 to unavailable, not unexpectedStatus", async () => {
    // Sync's internal rate limiter (a shared 300/min bucket) returns 429
    // under normal-ish load. Previously this fell through to
    // unexpectedStatus -> GenericError.NotSure (Status.UNSURE = 600, not a
    // real HTTP status) instead of a retryable service-busy signal.
    const { fn } = fakeFetch(async () => ({
      status: 429,
      json: async () => ({ error: "rate_limited" }),
    }));

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unavailable");
  });

  it("maps a connection failure to unavailable", async () => {
    const fn: SyncServiceClientOptions["fetch"] = async () => {
      throw new Error("ECONNREFUSED");
    };

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unavailable");
  });

  it("times out a request that outlives the deadline", async () => {
    // A fetch that only settles when aborted — the client's deadline fires first.
    const fn: SyncServiceClientOptions["fetch"] = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("timeout");
  });

  // Restarting Sync leaves the backend holding dead pooled sockets, so the
  // next write fails with ECONNRESET before Sync is reachable again. That
  // used to surface as an error toast on an edit that would have succeeded.
  describe("transient failure retry", () => {
    const failThen = (
      failures: Array<{ status: number } | "connection-failure">,
    ) => {
      let call = 0;
      const calls: Array<Record<string, string>> = [];
      const fn: SyncServiceClientOptions["fetch"] = async (_url, init) => {
        calls.push(init.headers);
        const scripted = failures[call];
        call += 1;
        if (scripted === "connection-failure") throw new Error("ECONNRESET");
        if (scripted) {
          return { status: scripted.status, json: async () => ({}) };
        }
        return { status: 200, json: async () => okBody() };
      };
      return { fn, calls, attempts: () => call };
    };

    it("retries a dropped connection and succeeds", async () => {
      const { fn, attempts } = failThen(["connection-failure"]);

      const result = await client(fn).queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
      expect(result.value.bookable).toBe(true);
      expect(attempts()).toBe(2);
    });

    it("retries a 503 readiness window and succeeds", async () => {
      const { fn, attempts } = failThen([{ status: 503 }, { status: 503 }]);

      const result = await client(fn).queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      expect(result.ok).toBe(true);
      expect(attempts()).toBe(3);
    });

    it("does not retry a 429", async () => {
      // Sync's own shared 300/min limiter. Retrying tightly would only
      // deepen the backlog it is reporting.
      const { fn, attempts } = failThen([{ status: 429 }]);

      const result = await client(fn).queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      expect(result.ok).toBe(false);
      expect(attempts()).toBe(1);
    });

    it("does not retry a timeout", async () => {
      // The caller already waited out the full deadline; a retry would just
      // double the wait before the same failure.
      let call = 0;
      const fn: SyncServiceClientOptions["fetch"] = (_url, init) => {
        call += 1;
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      };

      const result = await client(fn).queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("timeout");
      expect(call).toBe(1);
    });

    it("gives up after three attempts and returns the typed failure", async () => {
      const { fn, attempts } = failThen([
        "connection-failure",
        "connection-failure",
        "connection-failure",
        "connection-failure",
      ]);

      const result = await client(fn).queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("unavailable");
      expect(attempts()).toBe(3);
    });

    it("re-signs every attempt while holding the correlation id steady", async () => {
      // Sync rejects a timestamp outside its freshness window, so a retry
      // must carry a fresh signature rather than replaying the first one.
      let clock = NOW;
      const { fn, calls } = failThen(["connection-failure"]);
      const retryClient = new SyncServiceClient({
        baseUrl: BASE_URL,
        secret: SECRET,
        timeoutMs: 5_000,
        fetch: fn,
        now: () => {
          clock += 1_000;
          return clock;
        },
        newCorrelationId: () => "corr-retry",
      });

      await retryClient.queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      expect(calls).toHaveLength(2);
      expect(calls[0]?.["x-correlation-id"]).toBe("corr-retry");
      expect(calls[1]?.["x-correlation-id"]).toBe("corr-retry");
      expect(calls[1]?.["x-sync-timestamp"]).not.toBe(
        calls[0]?.["x-sync-timestamp"],
      );
      expect(calls[1]?.["x-sync-signature"]).not.toBe(
        calls[0]?.["x-sync-signature"],
      );
    });

    it("reports every retry so a self-healed blip is not silent", async () => {
      const { fn } = failThen(["connection-failure", { status: 503 }]);
      const seen: Array<{ kind: string; status?: number; attempt: number }> =
        [];

      const retryClient = new SyncServiceClient({
        baseUrl: BASE_URL,
        secret: SECRET,
        timeoutMs: 5_000,
        fetch: fn,
        now: () => NOW,
        newCorrelationId: () => "corr-1",
        onRetry: (info) =>
          seen.push({
            kind: info.kind,
            status: info.status,
            attempt: info.attempt,
          }),
      });

      await retryClient.queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      expect(seen).toEqual([
        { kind: "unavailable", status: undefined, attempt: 1 },
        { kind: "unavailable", status: 503, attempt: 2 },
      ]);
    });

    it("stops retrying once the caller's deadline has passed", async () => {
      // Retries must fit inside the timeout the caller was promised, so a
      // nominally 50ms read cannot quietly become a multi-second one.
      const { fn, attempts } = failThen([
        "connection-failure",
        "connection-failure",
        "connection-failure",
      ]);
      let clock = NOW;
      const deadlineClient = new SyncServiceClient({
        baseUrl: BASE_URL,
        secret: SECRET,
        timeoutMs: 50,
        fetch: fn,
        // Each read of the clock jumps past the 50ms budget.
        now: () => {
          clock += 500;
          return clock;
        },
        newCorrelationId: () => "corr-1",
      });

      const result = await deadlineClient.queryBusyAvailability(
        principal(),
        request([objectId()]),
      );

      expect(result.ok).toBe(false);
      expect(attempts()).toBe(1);
    });
  });

  it("keeps submitCommand open longer than the default read deadline", async () => {
    // Default client timeout is 20ms; a 50ms response must still succeed for
    // commands (provider deletes run inline and routinely exceed the read
    // deadline).
    const who = principal();
    const eventId = objectId() as EventId;
    const commandBody = {
      id: objectId(),
      tenantId: who.tenantId,
      principalId: who.principalId,
      idempotencyKey: "slow-delete-key",
      eventId,
      input: {
        kind: "delete",
        invitation: "none",
        scope: "all",
        recurrenceId: null,
      },
      expectedVersion: null,
      outcome: {
        state: "confirmed",
        providerEventId: null,
        providerVersion: null,
      },
      attemptCount: 1,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:01.000Z",
    };
    const fn: SyncServiceClientOptions["fetch"] = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        status: 200,
        json: async () => ({ command: commandBody }),
      };
    };

    const result = await client(fn).submitCommand(who, {
      idempotencyKey: "slow-delete-key" as IdempotencyKey,
      eventId: eventId,
      input: {
        kind: "delete",
        invitation: "none",
        scope: "all",
        recurrenceId: null,
      },
      expectedVersion: null,
    } as CommandSubmitRequest);

    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.value.command.outcome.state).toBe("confirmed");
  });

  it("rejects a 200 body that does not match the contract", async () => {
    const { fn } = fakeFetch(async () => ({
      status: 200,
      json: async () => ({ not: "a busy response" }),
    }));

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalidResponse");
  });

  it("never exposes the shared secret in the signature header or the result", async () => {
    const { fn, calls } = fakeFetch(async () => ({
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    }));

    const result = await client(fn).queryBusyAvailability(
      principal(),
      request([objectId()]),
    );

    const signature = calls[0]?.headers["x-sync-signature"] ?? "";
    // The header carries an HMAC (64 hex chars), never the raw secret.
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature).not.toContain(SECRET);
    // Nothing the caller receives contains the secret.
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
