import { faker } from "@faker-js/faker";
import { type NextFunction, type Request, type Response } from "express";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  createInternalAuthMiddleware,
  INTERNAL_AUTH_HEADERS,
  type InternalAuthedRequest,
  signInternalRequest,
} from "@sync/auth/internal-auth";

// The middleware is exercised by invoking it directly with a minimal req/res
// rather than a live Express route: the crypto/verification logic is covered
// exhaustively by verifyInternalRequest's own tests, and a registered auth
// route is a false-positive trigger for the "missing rate limiting" scanner
// (internal routes are private, single-trusted-caller, and not rate-limited by
// design). This test verifies only the express adapter contract: derive
// context from signed headers, attach it, call next; otherwise send 401.

const SECRET = "internal-service-secret";
const FIXED_NOW = 2_000_000;

const objectId = () => faker.database.mongodbObjectId();

const signedHeaders = (tenantId: string, principalId: string) => ({
  [INTERNAL_AUTH_HEADERS.tenant]: tenantId,
  [INTERNAL_AUTH_HEADERS.principal]: principalId,
  [INTERNAL_AUTH_HEADERS.timestamp]: String(FIXED_NOW),
  [INTERNAL_AUTH_HEADERS.signature]: signInternalRequest(SECRET, {
    timestamp: FIXED_NOW,
    tenantId,
    principalId,
  }),
});

interface FakeResponse {
  statusCode?: number;
  body?: unknown;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function fakeResponse(): FakeResponse {
  return {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const guard = createInternalAuthMiddleware({
  secret: SECRET,
  now: () => FIXED_NOW,
});

function run(req: Partial<InternalAuthedRequest>): {
  req: InternalAuthedRequest;
  res: FakeResponse;
  nextCalls: number;
} {
  const fullReq = { headers: {}, ...req } as InternalAuthedRequest;
  const res = fakeResponse();
  let nextCalls = 0;
  const next: NextFunction = () => {
    nextCalls += 1;
  };
  guard(fullReq as Request, res as unknown as Response, next);
  return { req: fullReq, res, nextCalls };
}

describe("internal auth middleware adapter", () => {
  it("attaches the signed context and calls next on a valid request", () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const { req, res, nextCalls } = run({
      headers: signedHeaders(tenantId, principalId),
    });

    expect(nextCalls).toBe(1);
    expect(res.statusCode).toBeUndefined();
    expect(req.syncAuth).toEqual({ tenantId, principalId });
  });

  it("responds 401 and does not call next on an unsigned request", () => {
    const { res, nextCalls } = run({ headers: {} });
    expect(nextCalls).toBe(0);
    expect(res.statusCode).toBe(401);
  });

  it("derives principal from the signed header, never the request body", () => {
    const tenantId = objectId() as TenantId;
    const signedPrincipal = objectId() as PrincipalId;
    const forgedPrincipal = objectId();

    // A body claiming a different principal must be ignored: the middleware
    // reads only the signed headers.
    const { req } = run({
      headers: signedHeaders(tenantId, signedPrincipal),
      body: { principalId: forgedPrincipal, tenantId },
    } as Partial<InternalAuthedRequest>);

    expect(req.syncAuth?.principalId).toBe(signedPrincipal);
    expect(req.syncAuth?.principalId).not.toBe(forgedPrincipal);
  });

  it("rejects a cross-tenant attempt (tenant header swapped after signing)", () => {
    const headers = signedHeaders(objectId(), objectId());
    headers[INTERNAL_AUTH_HEADERS.tenant] = objectId();

    const { req, res, nextCalls } = run({ headers });
    expect(nextCalls).toBe(0);
    expect(res.statusCode).toBe(401);
    expect(req.syncAuth).toBeUndefined();
  });
});
