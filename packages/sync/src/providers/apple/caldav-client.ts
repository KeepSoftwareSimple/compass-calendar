import { XMLParser } from "fast-xml-parser";

export interface CaldavCredential {
  readonly username: string;
  readonly password: string;
}

export interface CaldavResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly multistatus: ParsedMultistatus | null;
}

export interface ParsedMultistatus {
  readonly responses: readonly ParsedResponse[];
}

export interface ParsedResponse {
  readonly href: string;
  readonly propstats: readonly ParsedPropstat[];
}

export interface ParsedPropstat {
  readonly status: number;
  readonly props: Record<string, unknown>;
}

export type CaldavFetch = (
  url: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type CaldavClientErrorReason =
  | "authExpired"
  | "transient"
  | "discoveryFailed";

export class CaldavClientError extends Error {
  constructor(
    readonly reason: CaldavClientErrorReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CaldavClientError";
  }
}

const CALDAV_ORIGIN = "https://caldav.icloud.com";
const MAX_REDIRECTS = 5;

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "",
  isArray: (name) =>
    name === "response" || name === "propstat" || name === "href",
});

export interface CaldavClient {
  propfind(
    url: string,
    props: readonly string[],
    depth: 0 | 1,
  ): Promise<CaldavResponse>;
  report(url: string, bodyXml: string, depth: 0 | 1): Promise<CaldavResponse>;
  put(
    url: string,
    ics: string,
    options?: { ifMatch?: string; ifNoneMatch?: string },
  ): Promise<CaldavResponse>;
  delete(url: string, ifMatch?: string): Promise<CaldavResponse>;
  get(url: string): Promise<CaldavResponse>;
}

export type CaldavClientFactory = (
  credential: CaldavCredential,
  fetchImpl?: CaldavFetch,
) => CaldavClient;

export function createCaldavClient(
  credential: CaldavCredential,
  fetchImpl: CaldavFetch = fetch,
): CaldavClient {
  return new CaldavClientImpl(credential, fetchImpl);
}

class CaldavClientImpl implements CaldavClient {
  constructor(
    private readonly credential: CaldavCredential,
    private readonly fetchImpl: CaldavFetch,
  ) {}

  propfind(
    url: string,
    props: readonly string[],
    depth: 0 | 1,
  ): Promise<CaldavResponse> {
    const body = buildPropfindBody(props);
    return this.#request("PROPFIND", url, {
      body,
      depth: String(depth),
      contentType: "application/xml; charset=utf-8",
    });
  }

  report(url: string, bodyXml: string, depth: 0 | 1): Promise<CaldavResponse> {
    return this.#request("REPORT", url, {
      body: bodyXml,
      depth: String(depth),
      contentType: "application/xml; charset=utf-8",
    });
  }

  put(
    url: string,
    ics: string,
    options: { ifMatch?: string; ifNoneMatch?: string } = {},
  ): Promise<CaldavResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "text/calendar; charset=utf-8",
    };
    if (options.ifMatch) headers["If-Match"] = options.ifMatch;
    if (options.ifNoneMatch) headers["If-None-Match"] = options.ifNoneMatch;
    return this.#request("PUT", url, { body: ics, extraHeaders: headers });
  }

  delete(url: string, ifMatch?: string): Promise<CaldavResponse> {
    const extraHeaders: Record<string, string> = {};
    if (ifMatch) extraHeaders["If-Match"] = ifMatch;
    return this.#request("DELETE", url, { extraHeaders });
  }

  get(url: string): Promise<CaldavResponse> {
    return this.#request("GET", url, {});
  }

  async #request(
    method: string,
    url: string,
    options: {
      body?: string;
      depth?: string;
      contentType?: string;
      extraHeaders?: Record<string, string>;
    },
  ): Promise<CaldavResponse> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(this.credential),
      ...options.extraHeaders,
    };
    if (options.contentType) headers["Content-Type"] = options.contentType;
    if (options.depth) headers["Depth"] = options.depth;

    let currentUrl = url;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      let response: Response;
      try {
        response = await this.fetchImpl(currentUrl, {
          method,
          headers,
          body: options.body,
          redirect: "manual",
        });
      } catch (error) {
        throw redactAuthError(
          new CaldavClientError("transient", "CalDAV request failed", {
            cause: error,
          }),
        );
      }

      if (
        (response.status === 301 ||
          response.status === 302 ||
          response.status === 307 ||
          response.status === 308) &&
        redirects < MAX_REDIRECTS
      ) {
        const location = response.headers.get("Location");
        if (!location) break;
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      const body = await response.text();
      const parsedHeaders = headersToRecord(response.headers);
      return {
        status: response.status,
        headers: parsedHeaders,
        body,
        multistatus: parseMultistatus(body),
      };
    }

    throw redactAuthError(
      new CaldavClientError(
        "transient",
        "CalDAV redirect loop exceeded the limit",
      ),
    );
  }
}

export interface DiscoveredCaldavCalendar {
  readonly href: string;
  readonly providerCalendarId: string;
  readonly displayName: string;
  readonly color: string | null;
  readonly writable: boolean;
  readonly supportsVevent: boolean;
  readonly getctag: string | null;
  readonly syncToken: string | null;
}

export async function discoverCalendars(
  client: CaldavClient,
  _credential: CaldavCredential,
): Promise<readonly DiscoveredCaldavCalendar[]> {
  const principalResponse = await client.propfind(
    `${CALDAV_ORIGIN}/`,
    ["current-user-principal"],
    0,
  );
  assertDiscoveryStatus(principalResponse.status);

  const principalHref = extractHrefProp(
    principalResponse.multistatus,
    "current-user-principal",
  );
  if (!principalHref) {
    throw new CaldavClientError(
      "discoveryFailed",
      "CalDAV principal discovery returned no current-user-principal",
    );
  }

  const principalUrl = resolveHref(principalHref, CALDAV_ORIGIN);
  const homeResponse = await client.propfind(
    principalUrl,
    ["calendar-home-set"],
    0,
  );
  assertDiscoveryStatus(homeResponse.status);

  const homeHref = extractHrefProp(
    homeResponse.multistatus,
    "calendar-home-set",
  );
  if (!homeHref) {
    throw new CaldavClientError(
      "discoveryFailed",
      "CalDAV principal discovery returned no calendar-home-set",
    );
  }

  const homeUrl = resolveHref(homeHref, principalUrl);
  const calendarsResponse = await client.propfind(
    homeUrl,
    [
      "displayname",
      "resourcetype",
      "calendar-color",
      "current-user-privilege-set",
      "supported-calendar-component-set",
      "getctag",
      "sync-token",
    ],
    1,
  );
  assertDiscoveryStatus(calendarsResponse.status);

  return parseCalendarCollections(calendarsResponse.multistatus, homeUrl);
}

function assertDiscoveryStatus(status: number): void {
  if (status === 401) {
    throw new CaldavClientError(
      "authExpired",
      "CalDAV rejected the credentials",
    );
  }
  if (status === 403 || status === 429 || status === 503) {
    throw new CaldavClientError(
      "transient",
      `CalDAV throttled or refused discovery (${status})`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new CaldavClientError(
      "discoveryFailed",
      `CalDAV discovery failed (${status})`,
    );
  }
}

function buildPropfindBody(props: readonly string[]): string {
  const propElements = props.map((prop) => `<d:${prop}/>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
  <d:prop>${propElements}</d:prop>
</d:propfind>`;
}

function parseMultistatus(body: string): ParsedMultistatus | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<")) return null;
  try {
    const parsed = XML_PARSER.parse(trimmed) as Record<string, unknown>;
    const multistatus = parsed["multistatus"] as
      | Record<string, unknown>
      | undefined;
    if (!multistatus) return null;
    const responsesRaw = multistatus["response"];
    const responses = asArray(responsesRaw).map(parseResponse);
    return { responses };
  } catch {
    return null;
  }
}

function parseResponse(raw: unknown): ParsedResponse {
  const response = raw as Record<string, unknown>;
  const href = firstHref(response["href"]);
  const propstats = asArray(response["propstat"]).map(parsePropstat);
  return { href, propstats };
}

function parsePropstat(raw: unknown): ParsedPropstat {
  const propstat = raw as Record<string, unknown>;
  const statusText = String(propstat["status"] ?? "");
  const status = parseStatusCode(statusText);
  const prop = (propstat["prop"] as Record<string, unknown> | undefined) ?? {};
  return { status, props: prop };
}

function parseCalendarCollections(
  multistatus: ParsedMultistatus | null,
  homeUrl: string,
): DiscoveredCaldavCalendar[] {
  if (!multistatus) return [];
  const calendars: DiscoveredCaldavCalendar[] = [];

  for (const response of multistatus.responses) {
    if (!isCalendarCollection(response)) continue;
    if (isSkippedCollection(response.href)) continue;

    const props = successfulProps(response);
    const displayName =
      stringProp(props["displayname"]) ?? basename(response.href);
    const color = stripAppleColorAlpha(stringProp(props["calendar-color"]));
    const writable = hasWritePrivilege(props["current-user-privilege-set"]);
    const supportsVevent = supportsVeventComponent(
      props["supported-calendar-component-set"],
    );
    if (!supportsVevent) continue;

    calendars.push({
      href: resolveHref(response.href, homeUrl),
      providerCalendarId: response.href,
      displayName,
      color,
      writable,
      supportsVevent,
      getctag: stringProp(props["getctag"]),
      syncToken: stringProp(props["sync-token"]),
    });
  }

  return calendars;
}

function isCalendarCollection(response: ParsedResponse): boolean {
  const props = successfulProps(response);
  const resourceType = props["resourcetype"];
  if (!resourceType || typeof resourceType !== "object") return false;
  const type = resourceType as Record<string, unknown>;
  return "calendar" in type;
}

function isSkippedCollection(href: string): boolean {
  const lower = href.toLowerCase();
  return (
    lower.includes("inbox") ||
    lower.includes("outbox") ||
    lower.includes("notification")
  );
}

function supportsVeventComponent(componentSet: unknown): boolean {
  if (!componentSet || typeof componentSet !== "object") return true;
  const set = componentSet as Record<string, unknown>;
  const comps = asArray(set["comp"]);
  if (comps.length === 0) return true;
  const names = comps.map((comp) => {
    if (typeof comp === "object" && comp !== null && "name" in comp) {
      return String(
        (comp as Record<string, unknown>)["name"] ?? "",
      ).toUpperCase();
    }
    return String(comp).toUpperCase();
  });
  return names.includes("VEVENT");
}

function hasWritePrivilege(privilegeSet: unknown): boolean {
  if (!privilegeSet || typeof privilegeSet !== "object") return false;
  const set = privilegeSet as Record<string, unknown>;
  const privileges = collectPrivileges(set["privilege"]);
  return privileges.some((privilege) => privilege.endsWith("write"));
}

function collectPrivileges(raw: unknown): string[] {
  const results: string[] = [];
  for (const privilege of asArray(raw)) {
    if (typeof privilege === "string") {
      results.push(privilege.toLowerCase());
      continue;
    }
    if (typeof privilege === "object" && privilege !== null) {
      for (const key of Object.keys(privilege as Record<string, unknown>)) {
        results.push(key.toLowerCase());
      }
    }
  }
  return results;
}

function successfulProps(response: ParsedResponse): Record<string, unknown> {
  for (const propstat of response.propstats) {
    if (propstat.status >= 200 && propstat.status < 300) {
      return propstat.props;
    }
  }
  return {};
}

function extractHrefProp(
  multistatus: ParsedMultistatus | null,
  propName: string,
): string | null {
  if (!multistatus) return null;
  for (const response of multistatus.responses) {
    const props = successfulProps(response);
    const value = props[propName];
    if (!value || typeof value !== "object") continue;
    const href = firstHref((value as Record<string, unknown>)["href"]);
    if (href) return href;
  }
  return null;
}

export function stripAppleColorAlpha(color: string | null): string | null {
  if (!color) return null;
  const match = /^#([0-9a-fA-F]{8})$/.exec(color);
  if (match) return `#${match[1]!.slice(0, 6)}`;
  return color;
}

function basicAuthHeader(credential: CaldavCredential): string {
  const encoded = Buffer.from(
    `${credential.username}:${credential.password}`,
  ).toString("base64");
  return `Basic ${encoded}`;
}

function redactAuthError<T extends Error>(error: T): T {
  if (error.message.includes("Basic ")) {
    error.message = error.message.replace(
      /Basic [A-Za-z0-9+/=]+/g,
      "Basic [REDACTED]",
    );
  }
  if (error.cause instanceof Error) {
    error.cause.message = error.cause.message.replace(
      /Basic [A-Za-z0-9+/=]+/g,
      "Basic [REDACTED]",
    );
  }
  return error;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function resolveHref(href: string, base: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return new URL(href, base).href;
}

function firstHref(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return "";
}

function stringProp(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function basename(href: string): string {
  const trimmed = href.endsWith("/") ? href.slice(0, -1) : href;
  const parts = trimmed.split("/");
  return parts[parts.length - 1] ?? href;
}

function parseStatusCode(statusText: string): number {
  const match = /(\d{3})/.exec(statusText);
  return match ? Number(match[1]) : 0;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
