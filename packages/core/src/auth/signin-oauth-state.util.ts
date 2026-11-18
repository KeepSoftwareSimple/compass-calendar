import { type AuthOAuthFlow } from "@core/analytics/oauth-signup.events";

const SIGNIN_OAUTH_STATE_VERSION_PREFIX = "v1.";

const LEGACY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedSignInOAuthState = {
  rawState: string;
  nonce: string;
  posthogDistinctId?: string;
  flow: AuthOAuthFlow;
};

type SignInOAuthStatePayload = {
  n: string;
  ph?: string;
  fl?: AuthOAuthFlow;
};

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(encoded: string): string {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePayload(payload: SignInOAuthStatePayload): string {
  return `${SIGNIN_OAUTH_STATE_VERSION_PREFIX}${base64UrlEncode(JSON.stringify(payload))}`;
}

function decodePayload(body: string): SignInOAuthStatePayload | null {
  if (!body.startsWith(SIGNIN_OAUTH_STATE_VERSION_PREFIX)) {
    return null;
  }
  try {
    const json = base64UrlDecode(
      body.slice(SIGNIN_OAUTH_STATE_VERSION_PREFIX.length),
    );
    const parsed = JSON.parse(json) as SignInOAuthStatePayload;
    if (typeof parsed.n !== "string" || parsed.n.length === 0) {
      return null;
    }
    if (parsed.ph !== undefined && typeof parsed.ph !== "string") {
      return null;
    }
    if (
      parsed.fl !== undefined &&
      parsed.fl !== "signup" &&
      parsed.fl !== "login"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Builds OAuth `state` for provider sign-in, optionally carrying PostHog anon id. */
export function buildSignInOAuthState(input: {
  posthogDistinctId?: string;
  flow?: AuthOAuthFlow;
}): string {
  const payload: SignInOAuthStatePayload = {
    n: crypto.randomUUID(),
    ...(input.posthogDistinctId ? { ph: input.posthogDistinctId } : {}),
    ...(input.flow ? { fl: input.flow } : {}),
  };
  return encodePayload(payload);
}

export function parseSignInOAuthState(
  state: string,
): ParsedSignInOAuthState | null {
  const body = state.replace(/^compass-desktop:/, "");

  if (LEGACY_UUID_PATTERN.test(body)) {
    return {
      rawState: state,
      nonce: body,
      flow: "login",
    };
  }

  const payload = decodePayload(body);
  if (!payload) {
    return null;
  }

  const posthogDistinctId =
    payload.ph && payload.ph.length > 0 ? payload.ph : undefined;

  return {
    rawState: state,
    nonce: payload.n,
    posthogDistinctId,
    flow: payload.fl ?? "login",
  };
}

export function signInOAuthFlowFromState(
  state: string | null | undefined,
): AuthOAuthFlow {
  if (!state) return "login";
  const parsed = parseSignInOAuthState(state);
  if (parsed) return parsed.flow;
  return parseAppleRelayOAuthState(state).flow;
}

/**
 * Apple relays `state` back as its own base64 JSON blob rather than the
 * version-prefixed payload above. base64UrlDecode reads both alphabets (it
 * only rewrites `-`/`_` and re-pads), so one pass covers plain base64 too.
 */
function parseAppleRelayOAuthState(state: string): {
  posthogDistinctId?: string;
  flow: AuthOAuthFlow;
} {
  try {
    const parsed = JSON.parse(base64UrlDecode(state)) as {
      ph?: unknown;
      fl?: unknown;
    };
    const posthogDistinctId =
      typeof parsed.ph === "string" && parsed.ph.length > 0
        ? parsed.ph
        : undefined;
    const flow =
      parsed.fl === "signup" || parsed.fl === "login" ? parsed.fl : "login";
    return { posthogDistinctId, flow };
  } catch {
    return { flow: "login" };
  }
}

export function posthogDistinctIdFromSignInOAuthState(
  state: string | null | undefined,
): string | undefined {
  if (!state) return undefined;
  return (
    parseSignInOAuthState(state)?.posthogDistinctId ??
    parseAppleRelayOAuthState(state).posthogDistinctId
  );
}
