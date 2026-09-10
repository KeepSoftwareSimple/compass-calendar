import { faker } from "@faker-js/faker";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  type OAuthStatePayload,
  signOAuthState,
  verifyOAuthState,
} from "@sync/oauth/oauth-state";
import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

const SECRET = "state-secret";
const objectId = () => faker.database.mongodbObjectId();

const payload = (
  overrides: Partial<OAuthStatePayload> = {},
): OAuthStatePayload => ({
  tenantId: objectId() as TenantId,
  principalId: objectId() as PrincipalId,
  connectionId: null,
  provider: "google",
  issuedAt: 1_000_000,
  ...overrides,
});

describe("oauth-state", () => {
  it("round-trips a signed payload", () => {
    const original = payload();
    const token = signOAuthState(SECRET, original);

    const result = verifyOAuthState(SECRET, token, original.issuedAt);

    expect(result).toEqual({ ok: true, payload: original });
  });

  it("round-trips a reconnect payload carrying a connection id", () => {
    const original = payload({ connectionId: objectId() as ConnectionId });
    const token = signOAuthState(SECRET, original);

    const result = verifyOAuthState(SECRET, token, original.issuedAt);

    expect(result.ok && result.payload.connectionId).toBe(
      original.connectionId,
    );
  });

  it("rejects a token signed with a different secret", () => {
    const token = signOAuthState("other-secret", payload());
    expect(verifyOAuthState(SECRET, token, 1_000_000)).toEqual({
      ok: false,
      reason: "invalidSignature",
    });
  });

  it("rejects a tampered payload even though the signature is stale", () => {
    const token = signOAuthState(SECRET, payload());
    const [, signature] = token.split(".");
    // Swap the payload for a different principal but keep the old signature.
    const forged = Buffer.from(
      JSON.stringify({ t: objectId(), p: objectId(), c: null, i: 1_000_000 }),
    ).toString("base64url");

    expect(
      verifyOAuthState(SECRET, `${forged}.${signature}`, 1_000_000),
    ).toEqual({ ok: false, reason: "invalidSignature" });
  });

  it("rejects a correctly-signed but structurally invalid payload", () => {
    // A payload the attacker got signed somehow but that is not a valid state.
    const encoded = Buffer.from("not the expected shape").toString("base64url");
    const signature = createHmac("sha256", SECRET)
      .update(encoded)
      .digest("hex");

    expect(
      verifyOAuthState(SECRET, `${encoded}.${signature}`, 1_000_000),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an expired token", () => {
    const original = payload({ issuedAt: 1_000_000 });
    const token = signOAuthState(SECRET, original);

    // 11 minutes later, past the 10-minute default ttl.
    const result = verifyOAuthState(SECRET, token, 1_000_000 + 11 * 60 * 1000);

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token issued in the future (clock skew guard)", () => {
    const original = payload({ issuedAt: 2_000_000 });
    const token = signOAuthState(SECRET, original);

    expect(verifyOAuthState(SECRET, token, 1_000_000)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a state minted for one provider on another provider's callback", () => {
    const original = payload({ provider: "google" });
    const token = signOAuthState(SECRET, original);

    expect(
      verifyOAuthState(SECRET, token, original.issuedAt, {
        expectedProvider: "microsoft",
      }),
    ).toEqual({ ok: false, reason: "stateMismatch" });
  });

  it("defaults legacy payloads without a provider field to google", () => {
    const encoded = Buffer.from(
      JSON.stringify({
        t: objectId(),
        p: objectId(),
        c: null,
        i: 1_000_000,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET)
      .update(encoded)
      .digest("hex");
    const token = `${encoded}.${signature}`;

    const result = verifyOAuthState(SECRET, token, 1_000_000);
    expect(result.ok && result.payload.provider).toBe("google");
  });

  it("rejects a structurally malformed token", () => {
    for (const token of ["no-dot-here", ".onlysig", "onlypayload."]) {
      const result = verifyOAuthState(SECRET, token, 1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("malformed");
      }
    }
  });
});
