import { backOff } from "exponential-backoff";
import { type z } from "zod/v4";
import {
  encryptAdoptAuthorizationCredential,
  encryptInternalCredential,
} from "@core/security/internal-credential-envelope";
import {
  type ContactSuggestionsResponse,
  ContactSuggestionsResponseSchema,
} from "@core/types/contact.contracts";
import {
  type BusyAvailabilityRequest,
  type BusyAvailabilityResponse,
  BusyAvailabilityResponseSchema,
} from "@core/types/sync/availability.contracts";
import {
  type ChangeFeedCursor,
  type ChangeFeedResponse,
  ChangeFeedResponseSchema,
  type GlobalChangeFeedResponse,
  GlobalChangeFeedResponseSchema,
} from "@core/types/sync/change-feed.contracts";
import {
  type CommandSubmitRequest,
  type CommandSubmitResponse,
  CommandSubmitResponseSchema,
} from "@core/types/sync/command.contracts";
import {
  type ConnectionBeginRequest,
  type ConnectionBeginResponse,
  ConnectionBeginResponseSchema,
  type ConnectionCredentialRequest,
  type ConnectionCredentialResponse,
  ConnectionCredentialResponseSchema,
  type ConnectionListResponse,
  ConnectionListResponseSchema,
  type ConnectionRefreshResponse,
  ConnectionRefreshResponseSchema,
  type ForegroundRefreshRequest,
  type GoogleConnectionAdoptionRequest,
  type GoogleConnectionAdoptionResponse,
  GoogleConnectionAdoptionResponseSchema,
  type ProviderConnectionAdoptionRequest,
  type ProviderConnectionAdoptionResponse,
  type SyncCalendarListResponse,
  SyncCalendarListResponseSchema,
} from "@core/types/sync/connection.contracts";
import {
  type EventInstanceListQuery,
  type EventInstanceListResponse,
  EventInstanceListResponseSchema,
} from "@core/types/sync/event.contracts";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import {
  type PrincipalPurgeResponse,
  PrincipalPurgeResponseSchema,
} from "@core/types/sync/principal.contracts";
import { createHmac, randomUUID } from "node:crypto";

// The internal endpoints this client calls. Kept in sync with the Sync service's
// route paths; a contract test asserts they match.
const AVAILABILITY_BUSY_PATH = "/internal/availability/busy";
const CALENDARS_PATH = "/internal/calendars";
const CHANGES_PATH = "/internal/changes";
const CHANGES_ALL_PATH = "/internal/changes/all";
const CONNECTIONS_PATH = "/internal/connections";
const CONNECTIONS_BEGIN_PATH = "/internal/connections/begin";
const CONNECTIONS_CREDENTIAL_PATH = "/internal/connections/credential";
const CONNECTIONS_REFRESH_PATH = "/internal/connections/refresh";
const CONNECTIONS_FOREGROUND_REFRESH_PATH =
  "/internal/connections/foreground-refresh";
const ADOPT_GOOGLE_AUTHORIZATION_PATH =
  "/internal/connections/adopt-google-authorization";
const ADOPT_AUTHORIZATION_PATH = "/internal/connections/adopt-authorization";
const EVENTS_FULL_PATH = "/internal/events/full";
const COMMANDS_PATH = "/internal/commands";
const PRINCIPAL_PATH = "/internal/principal";
const CONTACTS_SUGGESTIONS_PATH = "/internal/contacts/suggestions";

const DEFAULT_TIMEOUT_MS = 5_000;

// Restarting Sync leaves the backend holding pooled keep-alive sockets that
// are already dead, so the next write fails with ECONNRESET before Sync is
// even reachable again. That failure returns in milliseconds, which makes a
// couple of retries nearly free and spares the user a toast on an edit that
// was always going to succeed. Two retries at ~100ms then ~300ms (full
// jitter) add under half a second in the worst case.
const RETRY_ATTEMPTS = 3;
const RETRY_STARTING_DELAY_MS = 100;
// Not mongo.service.ts's `timeMultiple: 5`, which is tuned for its 1s start.
const RETRY_TIME_MULTIPLE = 3;
// Provider create/update/delete run inline inside POST /internal/commands.
// The default read deadline is too short for a Google round-trip; aborting
// mid-delete leaves Sync applying the mutation while Compass API returns an
// error (staging: DELETE appeared to fail with 5xx while the event was gone).
export const COMMAND_TIMEOUT_MS = 30_000;

// The identity a request acts on behalf of. Signed into the request so the Sync
// service derives ownership from the signature, never the body.
export interface SyncPrincipal {
  tenantId: string;
  principalId: string;
}

export type SyncClientErrorKind =
  // The Sync service rejected our signature or identity (401).
  | "unauthorized"
  // The Sync service rejected the request shape (400) — a client/contract bug.
  | "badRequest"
  // The target does not exist for this principal (404) — e.g. disconnecting a
  // foreign or already-gone connection, or reconnecting an unknown one.
  | "notFound"
  // The Sync service refused the operation in its current mode (409) — e.g. a
  // provider-touching request against a passive deployment.
  | "conflict"
  // The service is unreachable or not ready (network failure or 503).
  | "unavailable"
  // The request exceeded the deadline.
  | "timeout"
  // A 2xx body that did not match the expected contract.
  | "invalidResponse"
  // Any other, unexpected status.
  | "unexpectedStatus";

// Carries no response body, secret, or identity — only what a caller needs to
// react and correlate. Safe to log.
export interface SyncClientError {
  kind: SyncClientErrorKind;
  status?: number;
  correlationId: string;
  // Present only for `invalidResponse`: a log-safe reason the 200 body failed
  // the contract — the failing field paths with their Zod issue code, the
  // body's top-level keys, and the content-type header. Field names, issue
  // codes, and a header only; never a field value. Lets a reader tell a real
  // contract drift (which field broke) from HTML the reverse proxy returned
  // with a 200.
  detail?: string;
}

export type SyncClientResult<T> =
  | { ok: true; value: T; correlationId: string }
  | { ok: false; error: SyncClientError };

// What a retry reports to the caller's logger. Same log-safe fields as
// SyncClientError plus which attempt failed and what it was reaching for.
export interface SyncClientRetryInfo {
  kind: SyncClientErrorKind;
  status?: number;
  attempt: number;
  correlationId: string;
  method: string;
  path: string;
}

// `unavailable` with no status is the #send catch: ECONNRESET or a refused
// connection, which is the dead-pooled-socket case a retry exists for. With
// a status it is Sync's readiness window (503), equally worth retrying.
// Excluded: 429, which is Sync's own shared 300/min internal limiter, where
// retrying tightly only deepens the backlog it is reporting; and `timeout`,
// where the caller has already waited out the whole deadline and a retry
// would just double the wait before the same failure.
function isRetryableSyncError(error: SyncClientError): boolean {
  return error.kind === "unavailable" && error.status !== 429;
}

// `backOff` retries on a *thrown* error, but #send returns a typed result and
// deliberately never throws. This sentinel carries a failed result through
// backOff's throw-based control flow; it never escapes this module.
class RetryableSyncFailure extends Error {
  constructor(readonly syncError: SyncClientError) {
    super("retryable sync failure");
    this.name = "RetryableSyncFailure";
  }
}

type FetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<SyncFetchResponse>;

interface SyncFetchResponse {
  status: number;
  json: () => Promise<unknown>;
  // Optional so a test double can omit it; the real fetch Response always
  // provides it. Read only to record the content-type of a body that failed
  // the contract.
  headers?: { get: (name: string) => string | null };
}

export interface SyncServiceClientOptions {
  // Base URL of the Sync service (no trailing slash), e.g. http://localhost:3010.
  baseUrl: string;
  // The shared internal-auth secret. Never logged or returned to callers.
  secret: string;
  // Per-request deadline; a slow/hung service fails as `timeout` not a hang.
  timeoutMs?: number;
  // Called once per retry. The client has no logger of its own; the factory
  // wires this to one so a self-healed blip still leaves a trail.
  onRetry?: (info: SyncClientRetryInfo) => void;
  // Injectable seams for tests.
  fetch?: FetchFn;
  now?: () => number;
  newCorrelationId?: () => string;
}

// Sign a request the way the Sync service verifies it: an HMAC-SHA256 over
// `timestamp.tenantId.principalId` with the shared secret. Reimplemented here
// (rather than importing the Sync package) so the backend does not build-depend
// on the independently-deployable Sync service; a contract test proves the
// signature this produces is accepted by the real verifier.
function signRequest(
  secret: string,
  timestamp: number,
  principal: SyncPrincipal,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${principal.tenantId}.${principal.principalId}`)
    .digest("hex");
}

// Sign a request that acts on behalf of no single tenant/principal — today,
// only the global change-feed poll. Domain-separated from signRequest above
// (a distinct HMAC preimage, "service." vs "<timestamp>.<tenant>.<principal>")
// so a per-principal-signed request can never be replayed here. Reimplemented
// here for the same reason signRequest is: this client build-depends on
// neither the Sync service nor its independently-deployable package; a
// contract test proves this is accepted by the real verifier
// (verifyServiceRequest).
function signServiceRequest(secret: string, timestamp: number): string {
  return createHmac("sha256", secret)
    .update(`service.${timestamp}`)
    .digest("hex");
}

// A typed, authenticated client for the Compass Sync service's internal API. It
// signs each request, bounds it with a timeout, and maps every outcome to a
// typed result — the caller never sees a thrown network error, a raw status, or
// an unvalidated body.
export class SyncServiceClient {
  readonly #baseUrl: string;
  readonly #secret: string;
  readonly #timeoutMs: number;
  readonly #fetch: FetchFn;
  readonly #now: () => number;
  readonly #newCorrelationId: () => string;
  readonly #onRetry?: (info: SyncClientRetryInfo) => void;

  constructor(options: SyncServiceClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#secret = options.secret;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetch ?? (globalThis.fetch as unknown as FetchFn);
    this.#now = options.now ?? Date.now;
    this.#newCorrelationId = options.newCorrelationId ?? randomUUID;
    this.#onRetry = options.onRetry;
  }

  // The caller's provider connections, scoped to the signed principal. A read;
  // served in the Sync service's passive mode too, so it is safe to call before
  // any provider work has run.
  listConnections(
    principal: SyncPrincipal,
    correlationId?: string,
  ): Promise<SyncClientResult<ConnectionListResponse>> {
    return this.#request({
      method: "GET",
      path: CONNECTIONS_PATH,
      principal,
      schema: ConnectionListResponseSchema,
      correlationId,
    });
  }

  // The caller's provider calendars, scoped to the signed principal. A read;
  // served in passive mode too. Backs the browser calendar list under sync
  // delegation.
  //
  // By default this includes calendars the provider no longer lists (active:
  // false) — the browser's own list surface needs those for name/color lookup
  // on events that still reference them. Pass { activeOnly: true } for
  // anything that resolves which calendars a request may act on (e.g.
  // event-range ownership) — a retired calendar should never be treated as an
  // owned id again.
  listCalendars(
    principal: SyncPrincipal,
    options: { activeOnly?: boolean; correlationId?: string } = {},
  ): Promise<SyncClientResult<SyncCalendarListResponse>> {
    let query: URLSearchParams | undefined;
    if (options.activeOnly) {
      query = new URLSearchParams();
      query.set("activeOnly", "true");
    }
    return this.#request({
      method: "GET",
      path: CALENDARS_PATH,
      principal,
      schema: SyncCalendarListResponseSchema,
      correlationId: options.correlationId,
      query,
    });
  }

  // Start an OAuth authorization flow and return the provider consent URL the
  // browser should be sent to. Pass a connectionId to reconnect an existing
  // connection; omit it for a fresh one. The Sync service only mints the URL
  // here (and requires active execution mode, else it returns a 409 mapped to
  // `conflict`); the connection is created when the provider calls back.
  beginConnection(
    principal: SyncPrincipal,
    request: ConnectionBeginRequest = {},
    correlationId?: string,
  ): Promise<SyncClientResult<ConnectionBeginResponse>> {
    return this.#request({
      method: "POST",
      path: CONNECTIONS_BEGIN_PATH,
      principal,
      body: request,
      schema: ConnectionBeginResponseSchema,
      correlationId,
    });
  }

  createCredentialConnection(
    principal: SyncPrincipal,
    request: ConnectionCredentialRequest,
    correlationId?: string,
  ): Promise<SyncClientResult<ConnectionCredentialResponse>> {
    return this.#request({
      method: "POST",
      path: CONNECTIONS_CREDENTIAL_PATH,
      principal,
      body: request,
      schema: ConnectionCredentialResponseSchema,
      correlationId,
    });
  }

  // Adopt a Google authorization that Compass API exchanged during sign-in.
  // This is trusted internal traffic; refresh tokens never cross the browser.
  adoptGoogleAuthorization(
    principal: SyncPrincipal,
    request: Omit<GoogleConnectionAdoptionRequest, "credential"> & {
      refreshToken: string;
    },
    correlationId?: string,
  ): Promise<SyncClientResult<GoogleConnectionAdoptionResponse>> {
    return this.#request({
      method: "POST",
      path: ADOPT_GOOGLE_AUTHORIZATION_PATH,
      principal,
      body: {
        account: request.account,
        credential: encryptInternalCredential(
          this.#secret,
          request.refreshToken,
          {
            tenantId: principal.tenantId,
            principalId: principal.principalId,
            account: request.account,
            grantedScopes: request.grantedScopes,
          },
        ),
        grantedScopes: request.grantedScopes,
      },
      schema: GoogleConnectionAdoptionResponseSchema,
      correlationId,
    });
  }

  // Adopt a provider authorization that Compass API exchanged during sign-in.
  // Microsoft (and later Apple) use this path. Google sign-in still uses
  // adoptGoogleAuthorization so its envelope AAD stays byte-identical.
  adoptProviderAuthorization(
    principal: SyncPrincipal,
    request: Omit<ProviderConnectionAdoptionRequest, "credential"> & {
      refreshToken: string;
      provider: ProviderKind;
    },
    correlationId?: string,
  ): Promise<SyncClientResult<ProviderConnectionAdoptionResponse>> {
    return this.#request({
      method: "POST",
      path: ADOPT_AUTHORIZATION_PATH,
      principal,
      body: {
        provider: request.provider,
        account: request.account,
        credential: encryptAdoptAuthorizationCredential(
          this.#secret,
          request.refreshToken,
          {
            tenantId: principal.tenantId,
            principalId: principal.principalId,
            provider: request.provider,
            account: request.account,
            grantedScopes: request.grantedScopes,
          },
        ),
        grantedScopes: request.grantedScopes,
      },
      schema: GoogleConnectionAdoptionResponseSchema,
      correlationId,
    });
  }

  // Enqueue incremental pulls for every events resource owned by the principal
  // (user-triggered "Refresh calendar").
  refreshConnection(
    principal: SyncPrincipal,
    correlationId?: string,
  ): Promise<SyncClientResult<ConnectionRefreshResponse>> {
    return this.#request({
      method: "POST",
      path: CONNECTIONS_REFRESH_PATH,
      principal,
      body: {},
      schema: ConnectionRefreshResponseSchema,
      correlationId,
    });
  }

  refreshForegroundConnections(
    principalIds: ForegroundRefreshRequest["principalIds"],
    correlationId?: string,
  ): Promise<SyncClientResult<ConnectionRefreshResponse>> {
    return this.#requestUnscoped({
      method: "POST",
      path: CONNECTIONS_FOREGROUND_REFRESH_PATH,
      body: { principalIds },
      schema: ConnectionRefreshResponseSchema,
      correlationId,
    });
  }

  // A page of full-fidelity event rows (content + schedule + series linkage) for
  // the given calendars and range, scoped to the signed principal. Backs the
  // browser calendar read — each row carries what the app needs to render AND
  // edit. `calendarIds` is serialized as repeated query params so the Sync
  // route parses it back into an array; pass `query.cursor` from a prior
  // response's `nextCursor` to page.
  listFullEvents(
    principal: SyncPrincipal,
    query: EventInstanceListQuery,
    correlationId?: string,
  ): Promise<SyncClientResult<EventInstanceListResponse>> {
    const params = new URLSearchParams();
    for (const calendarId of query.calendarIds) {
      params.append("calendarIds", calendarId);
    }
    params.set("start", query.start);
    params.set("end", query.end);
    if (query.cursor !== undefined) params.set("cursor", query.cursor);
    if (query.limit !== undefined) params.set("limit", String(query.limit));

    return this.#request({
      method: "GET",
      path: EVENTS_FULL_PATH,
      query: params,
      principal,
      schema: EventInstanceListResponseSchema,
      correlationId,
    });
  }

  // Durably record one event-mutation command (create/update/move/delete),
  // scoped to the signed principal. Idempotent on the request's idempotencyKey:
  // a retry with the same key maps to the same command rather than duplicating
  // it. Because Sync may have already accepted a submission whose response we
  // never saw (timeout/unavailable), a caller MUST retry with the SAME key and
  // never fall back to a legacy write.
  submitCommand(
    principal: SyncPrincipal,
    request: CommandSubmitRequest,
    correlationId?: string,
  ): Promise<SyncClientResult<CommandSubmitResponse>> {
    return this.#request({
      method: "POST",
      path: COMMANDS_PATH,
      principal,
      body: request,
      schema: CommandSubmitResponseSchema,
      correlationId,
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
  }

  // Merged busy intervals plus freshness/bookability evidence for a set of
  // blocking calendars.
  queryBusyAvailability(
    principal: SyncPrincipal,
    request: BusyAvailabilityRequest,
    correlationId?: string,
  ): Promise<SyncClientResult<BusyAvailabilityResponse>> {
    return this.#request({
      method: "POST",
      path: AVAILABILITY_BUSY_PATH,
      principal,
      body: request,
      schema: BusyAvailabilityResponseSchema,
      correlationId,
    });
  }

  // Ranked contact suggestions for the attendee type-ahead, scoped to the
  // signed principal. A provider-touching read: sync queries the People API
  // per request (contacts are never cached) and answers 403 when no
  // connection granted a contacts scope, so callers should treat any failure
  // as "no suggestions" — the lookup is a convenience, never load-bearing.
  // Neither the query nor the response content belongs in any log.
  getContactSuggestions(
    principal: SyncPrincipal,
    query: string,
    correlationId?: string,
  ): Promise<SyncClientResult<ContactSuggestionsResponse>> {
    const params = new URLSearchParams();
    params.set("q", query);
    return this.#request({
      method: "GET",
      path: CONTACTS_SUGGESTIONS_PATH,
      query: params,
      principal,
      schema: ContactSuggestionsResponseSchema,
      correlationId,
    });
  }

  // Resumable content-free invalidation page for the signed principal. Pass
  // `null` to resume from now (empty page + watermark). A stale/unknown cursor
  // returns `{ kind: "resyncRequired" }` rather than a partial replay.
  getChanges(
    principal: SyncPrincipal,
    cursor: ChangeFeedCursor | null,
    correlationId?: string,
  ): Promise<SyncClientResult<ChangeFeedResponse>> {
    const params = new URLSearchParams();
    if (cursor !== null) params.set("cursor", cursor);
    return this.#request({
      method: "GET",
      path: CHANGES_PATH,
      query: params,
      principal,
      schema: ChangeFeedResponseSchema,
      correlationId,
    });
  }

  // Resumable content-free invalidation page across EVERY tenant/principal —
  // backs the single multiplexed change-feed poll the backend runs once per
  // process instead of once per connected user. Signed as the service itself,
  // not any principal (see signServiceRequest): there is no single tenant or
  // principal this request acts on behalf of. Pass `null` to resume from now.
  getGlobalChanges(
    cursor: ChangeFeedCursor | null,
    correlationId?: string,
  ): Promise<SyncClientResult<GlobalChangeFeedResponse>> {
    const params = new URLSearchParams();
    if (cursor !== null) params.set("cursor", cursor);
    return this.#requestUnscoped({
      method: "GET",
      path: CHANGES_ALL_PATH,
      query: params,
      schema: GlobalChangeFeedResponseSchema,
      correlationId,
    });
  }

  // Disconnect one of the caller's connections: Sync revokes the credential at
  // the provider and marks the connection disconnected. Scoped to the signed
  // principal, so a foreign or missing connection is a clean not-found that
  // revokes nothing. Idempotent. The other connections are untouched.
  disconnectConnection(
    principal: SyncPrincipal,
    connectionId: string,
    correlationId?: string,
  ): Promise<SyncClientResult<void>> {
    return this.#request({
      method: "DELETE",
      path: `${CONNECTIONS_PATH}/${encodeURIComponent(connectionId)}`,
      principal,
      // No schema: sync answers 204 with no body, so there is nothing to
      // parse - #send treats a schema-less request as expecting 204.
      correlationId,
    });
  }

  // Hard-delete every Sync-held row for the signed principal (account deletion).
  // Served in Sync passive mode too. Idempotent: a retry returns zero counts.
  purgePrincipal(
    principal: SyncPrincipal,
    correlationId?: string,
  ): Promise<SyncClientResult<PrincipalPurgeResponse>> {
    return this.#request({
      method: "DELETE",
      path: PRINCIPAL_PATH,
      principal,
      schema: PrincipalPurgeResponseSchema,
      correlationId,
    });
  }

  async #request<T>(input: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: URLSearchParams;
    principal: SyncPrincipal;
    body?: unknown;
    // Absent only for a no-content route: #send then expects a 204.
    schema?: z.ZodType<T>;
    correlationId?: string;
    timeoutMs?: number;
  }): Promise<SyncClientResult<T>> {
    const correlationId = input.correlationId ?? this.#newCorrelationId();
    return this.#sendWithRetry(input, correlationId, () => {
      const timestamp = this.#now();
      return {
        "content-type": "application/json",
        "x-sync-tenant": input.principal.tenantId,
        "x-sync-principal": input.principal.principalId,
        "x-sync-timestamp": String(timestamp),
        "x-sync-signature": signRequest(
          this.#secret,
          timestamp,
          input.principal,
        ),
        "x-correlation-id": correlationId,
      };
    });
  }

  // Same signed-request/timeout/parse machinery as #request, for a route that
  // acts on behalf of no single tenant/principal (today, only the global
  // change-feed poll). Signs a domain-separated payload with no identity
  // claim — see signServiceRequest — so it can never be confused with, or
  // used to replay, a per-principal-signed request.
  async #requestUnscoped<T>(input: {
    method: "GET" | "POST";
    path: string;
    query?: URLSearchParams;
    body?: unknown;
    schema: z.ZodType<T>;
    correlationId?: string;
    timeoutMs?: number;
  }): Promise<SyncClientResult<T>> {
    const correlationId = input.correlationId ?? this.#newCorrelationId();
    return this.#sendWithRetry(input, correlationId, () => {
      const timestamp = this.#now();
      return {
        "content-type": "application/json",
        "x-sync-timestamp": String(timestamp),
        "x-sync-signature": signServiceRequest(this.#secret, timestamp),
        "x-correlation-id": correlationId,
      };
    });
  }

  // Retries a transient connection failure a couple of times before the
  // caller ever sees it. Headers are rebuilt per attempt rather than reused:
  // Sync's verifier rejects a timestamp outside its freshness window, so
  // replaying attempt 1's signature is fragile by construction. The
  // correlationId is held constant so one user action stays one id in
  // Sync's logs.
  async #sendWithRetry<T>(
    input: {
      method: "GET" | "POST" | "DELETE";
      path: string;
      query?: URLSearchParams;
      body?: unknown;
      schema?: z.ZodType<T>;
      timeoutMs?: number;
    },
    correlationId: string,
    buildHeaders: () => Record<string, string>,
  ): Promise<SyncClientResult<T>> {
    // Retries have to fit inside the deadline the caller was promised, so a
    // nominally 5s read can never quietly become a 15s one. submitCommand's
    // 30s budget affords more retry room than a 5s read for free, which is
    // why reads and writes need no separate policy.
    const retryDeadline = this.#now() + (input.timeoutMs ?? this.#timeoutMs);
    let attempt = 0;

    const attemptSend = async (): Promise<SyncClientResult<T>> => {
      attempt += 1;
      const result = await this.#send({
        ...input,
        headers: buildHeaders(),
        correlationId,
      });
      if (result.ok || !isRetryableSyncError(result.error)) return result;
      if (this.#now() >= retryDeadline) return result;
      throw new RetryableSyncFailure(result.error);
    };

    try {
      return await backOff(attemptSend, {
        jitter: "full",
        numOfAttempts: RETRY_ATTEMPTS,
        startingDelay: RETRY_STARTING_DELAY_MS,
        timeMultiple: RETRY_TIME_MULTIPLE,
        retry: (error: unknown) => {
          if (!(error instanceof RetryableSyncFailure)) return false;
          this.#onRetry?.({
            kind: error.syncError.kind,
            status: error.syncError.status,
            attempt,
            correlationId,
            method: input.method,
            path: input.path,
          });
          return true;
        },
      });
    } catch (error) {
      // The last attempt still failed: unwrap the sentinel back into the
      // typed result the caller expects.
      if (error instanceof RetryableSyncFailure) {
        return { ok: false, error: error.syncError };
      }
      throw error;
    }
  }

  async #send<T>(input: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: URLSearchParams;
    body?: unknown;
    schema?: z.ZodType<T>;
    correlationId: string;
    headers: Record<string, string>;
    timeoutMs?: number;
  }): Promise<SyncClientResult<T>> {
    const { correlationId } = input;
    const queryString = input.query?.toString();
    const url =
      queryString !== undefined && queryString.length > 0
        ? `${this.#baseUrl}${input.path}?${queryString}`
        : `${this.#baseUrl}${input.path}`;

    const controller = new AbortController();
    const deadlineMs = input.timeoutMs ?? this.#timeoutMs;
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    let response: SyncFetchResponse;
    try {
      response = await this.#fetch(url, {
        method: input.method,
        headers: input.headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: controller.signal,
      });
    } catch (error) {
      // An abort is our deadline firing; anything else is a connection failure.
      const kind =
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "unavailable";
      return { ok: false, error: { kind, correlationId } };
    } finally {
      clearTimeout(timer);
    }

    // A schema-less request is a no-content route: it succeeds with 204 and
    // an empty body, so there is nothing to parse and a 200-with-body would
    // itself be unexpected.
    if (!input.schema) {
      return response.status === 204
        ? { ok: true, value: undefined as T, correlationId }
        : errorResult(
            statusToKind(response.status),
            correlationId,
            response.status,
          );
    }

    if (response.status === 200) {
      const contentType = response.headers?.get("content-type") ?? undefined;
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        // The body was not JSON at all — HTML the reverse proxy returned in
        // front of Sync. The content-type is what tells the two apart.
        return errorResult(
          "invalidResponse",
          correlationId,
          200,
          contentType
            ? `body is not JSON; content-type=${contentType}`
            : "body is not JSON",
        );
      }
      const parsed = input.schema.safeParse(body);
      if (!parsed.success) {
        return errorResult(
          "invalidResponse",
          correlationId,
          200,
          describeContractMismatch(parsed.error, body, contentType),
        );
      }
      return { ok: true, value: parsed.data, correlationId };
    }

    return errorResult(
      statusToKind(response.status),
      correlationId,
      response.status,
    );
  }
}

function statusToKind(status: number): SyncClientErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 400) return "badRequest";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  // unexpectedStatus -> Sync proxy 502 (never Status.UNSURE / HTTP 600).
  // 429 is sync's own internal rate limiter (internal-http.ts), tripped
  // easily under normal-ish load (a shared 300/min bucket for the whole
  // backend). Treated the same as 503: a retryable service-busy state, not
  // an unexpected condition.
  if (status === 429 || status === 503) return "unavailable";
  return "unexpectedStatus";
}

function errorResult<T>(
  kind: SyncClientErrorKind,
  correlationId: string,
  status?: number,
  detail?: string,
): SyncClientResult<T> {
  return { ok: false, error: { kind, status, correlationId, detail } };
}

// The most an `invalidResponse` detail ever carries — a guard against a huge
// Zod error (one issue per element of a large array) blowing up the log line.
const MAX_ISSUES = 5;
const MAX_BODY_KEYS = 20;

// A log-safe reason a 200 body failed the schema: the first failing field
// paths with their Zod issue code, the body's top-level keys, and the
// content-type. Field names, issue codes, and a header only — never a field
// value, so it stays safe to log and to return to the caller.
function describeContractMismatch(
  error: z.ZodError,
  body: unknown,
  contentType: string | undefined,
): string {
  const issues = error.issues.slice(0, MAX_ISSUES).map(summarizeIssue);
  if (error.issues.length > MAX_ISSUES) {
    issues.push(`+${error.issues.length - MAX_ISSUES} more`);
  }
  const parts = [`issues=${issues.join(", ")}`];
  const keys = topLevelKeys(body);
  if (keys) parts.push(`keys=${keys}`);
  if (contentType) parts.push(`content-type=${contentType}`);
  return parts.join("; ");
}

// A single Zod issue as `path: code`. For an unrecognized-key issue — the
// rolling-deploy case where Sync added a field a strict schema rejects — the
// offending key names are the whole point, so they ride along.
function summarizeIssue(issue: z.core.$ZodIssue): string {
  const location = issue.path.length > 0 ? issue.path.join(".") : "<root>";
  if (issue.code === "unrecognized_keys") {
    return `${location}: unrecognized_keys [${issue.keys.join(", ")}]`;
  }
  return `${location}: ${issue.code}`;
}

// The body's own top-level field names (not values), so a reader sees the
// shape Sync actually sent alongside the fields the schema rejected.
function topLevelKeys(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const keys = Object.keys(body);
  const shown = keys.slice(0, MAX_BODY_KEYS).join(",");
  return keys.length > MAX_BODY_KEYS ? `${shown},…` : shown || undefined;
}
