import {
  HTTP_JSON_BODY_LIMIT,
  HTTP_SERVER_LIMITS,
} from "@core/server/http-server";
import {
  createBackendHttpServer,
  initExpressServer,
} from "@backend/servers/express/express.server";
import { describe, expect, it } from "bun:test";

describe("initExpressServer", () => {
  it("trusts one proxy hop so Caddy X-Forwarded-For does not collapse rate-limit keys", () => {
    const app = initExpressServer();
    expect(app.get("trust proxy")).toBe(1);
  });

  it("uses the flat query parser so repeated parameters remain arrays", () => {
    const app = initExpressServer();
    expect(app.get("query parser")).toBe("simple");
  });

  it("exports a bounded JSON body limit for express.json()", () => {
    expect(HTTP_JSON_BODY_LIMIT).toBe("256kb");
  });

  it("creates an HTTP server with bounded connection limits", () => {
    const server = createBackendHttpServer();
    expect(server.requestTimeout).toBe(HTTP_SERVER_LIMITS.requestTimeoutMs);
    expect(server.headersTimeout).toBe(HTTP_SERVER_LIMITS.headersTimeoutMs);
  });
});
