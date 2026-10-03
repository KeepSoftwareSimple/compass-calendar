import {
  type ConnectionId,
  ConnectionIdSchema,
  type PrincipalId,
  PrincipalIdSchema,
  type ProviderKind,
  ProviderKindSchema,
  type TenantId,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

// The CSRF state carried through a provider OAuth round-trip. The service signs
// it at `begin`, the provider echoes it back on the callback, and the service
// verifies the signature to recover WHO the flow was for — without any
// server-side session store. The state is the only trust on the public
// callback, so it is HMAC-signed and time-bounded, exactly like internal-auth.

export type OAuthReturnChannel = "desktop";

export interface OAuthStatePayload {
  readonly tenantId: TenantId;
  readonly principalId: PrincipalId;
  // Present when re-authorizing a specific existing connection (reconnect),
  // absent for a first-time connect.
  readonly connectionId: ConnectionId | null;
  // Which provider kind this consent flow was minted for. Callback routes
  // reject a state presented on a different provider's path (stateMismatch).
  readonly provider: ProviderKind;
  // Milliseconds since the epoch when the state was issued.
  readonly issuedAt: number;
  /** When set, the web post-connect page relays to `compass://connect/...`. */
  readonly returnChannel?: OAuthReturnChannel;
}

// Default lifetime of a state token: long enough for a human to complete
// consent, short enough to bound replay of a leaked callback URL.
export const DEFAULT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// Derive a purpose-specific signing key from the service root secret, so the
// OAuth state and internal-auth request signatures never share a key. Domain
// separation: even though the two message formats are already structurally
// distinct, a distinct key removes any cross-protocol coupling for free.
export function deriveOAuthStateSecret(rootSecret: string): string {
  return createHmac("sha256", rootSecret)
    .update("compass-sync/oauth-state")
    .digest("hex");
}

// A signed token is `<base64url(payload json)>.<hmac hex>`. The payload is
// public (it rides in a URL); the signature is what makes it unforgeable.
export function signOAuthState(
  secret: string,
  payload: OAuthStatePayload,
): string {
  const encoded = encodePayload(payload);
  return `${encoded}.${sign(secret, encoded)}`;
}

export type OAuthStateFailure =
  | "malformed"
  | "invalidSignature"
  | "expired"
  | "stateMismatch";

export type OAuthStateResult =
  | { readonly ok: true; readonly payload: OAuthStatePayload }
  | { readonly ok: false; readonly reason: OAuthStateFailure };

export interface VerifyOAuthStateOptions {
  ttlMs?: number;
  expectedProvider?: ProviderKind;
}

export function verifyOAuthState(
  secret: string,
  token: string,
  now: number,
  options: VerifyOAuthStateOptions = {},
): OAuthStateResult {
  const ttlMs = options.ttlMs ?? DEFAULT_OAUTH_STATE_TTL_MS;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  // Verify the signature before trusting any byte of the payload.
  if (!signaturesMatch(sign(secret, encoded), signature)) {
    return { ok: false, reason: "invalidSignature" };
  }

  const payload = decodePayload(encoded);
  if (!payload) return { ok: false, reason: "malformed" };

  if (now - payload.issuedAt > ttlMs || payload.issuedAt > now) {
    return { ok: false, reason: "expired" };
  }
  if (
    options.expectedProvider !== undefined &&
    payload.provider !== options.expectedProvider
  ) {
    return { ok: false, reason: "stateMismatch" };
  }
  return { ok: true, payload };
}

function sign(secret: string, encoded: string): string {
  return createHmac("sha256", secret).update(encoded).digest("hex");
}

function signaturesMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function encodePayload(payload: OAuthStatePayload): string {
  const json = JSON.stringify({
    t: payload.tenantId,
    p: payload.principalId,
    c: payload.connectionId,
    k: payload.provider,
    i: payload.issuedAt,
    ...(payload.returnChannel ? { r: payload.returnChannel } : {}),
  });
  return Buffer.from(json, "utf8").toString("base64url");
}

// Decode and re-validate every field through the branded schemas, so a tampered
// (but somehow correctly-signed) or malformed payload can never yield a usable
// identity. Returns null on any structural problem.
function decodePayload(encoded: string): OAuthStatePayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;

  const record = raw as Record<string, unknown>;
  const tenantId = TenantIdSchema.safeParse(record["t"]);
  const principalId = PrincipalIdSchema.safeParse(record["p"]);
  const issuedAt = record["i"];
  if (!tenantId.success || !principalId.success) return null;
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return null;

  // connectionId is optional; when present it must be a valid connection id.
  let connectionId: ConnectionId | null = null;
  if (record["c"] !== null && record["c"] !== undefined) {
    const parsed = ConnectionIdSchema.safeParse(record["c"]);
    if (!parsed.success) return null;
    connectionId = parsed.data;
  }

  // States minted before provider was bound to the payload default to google.
  const providerParsed = ProviderKindSchema.safeParse(record["k"] ?? "google");
  if (!providerParsed.success) return null;

  const returnChannel =
    record["r"] === "desktop" ? ("desktop" as const) : undefined;

  return {
    tenantId: tenantId.data,
    principalId: principalId.data,
    connectionId,
    provider: providerParsed.data,
    issuedAt,
    ...(returnChannel ? { returnChannel } : {}),
  };
}
