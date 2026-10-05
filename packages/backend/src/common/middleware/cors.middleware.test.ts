import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { APPLE_SIGNIN_FORM_POST_PATH } from "@backend/auth/services/apple/apple.auth.callback";
import { CONFIG } from "@backend/common/constants/config.constants";
import corsMiddleware from "@backend/common/middleware/cors.middleware";
import { describe, expect, it } from "bun:test";

const app = express();
app.use(corsMiddleware);
app.use((_req, res) => res.sendStatus(204));
const rejectCors: ErrorRequestHandler = (_error, _req, res, _next) => {
  res.sendStatus(403);
};
app.use(rejectCors);

describe("CORS for Apple's form-post callback", () => {
  it("allows Apple's callback navigation without granting API read access", async () => {
    const response = await request(app)
      .post(APPLE_SIGNIN_FORM_POST_PATH)
      .set("Origin", "https://appleid.apple.com");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(
      response.headers["access-control-allow-credentials"],
    ).toBeUndefined();
  });

  it.each(["get", "options"] as const)(
    "rejects Apple's %s requests to the callback",
    async (method) => {
      const response = await request(app)
        [method](APPLE_SIGNIN_FORM_POST_PATH)
        .set("Origin", "https://appleid.apple.com");
      expect(response.status).toBe(403);
    },
  );

  it("rejects Apple's origin on other API routes", async () => {
    const response = await request(app)
      .post("/api/user/metadata")
      .set("Origin", "https://appleid.apple.com");
    expect(response.status).toBe(403);
  });

  it("rejects an unrelated origin on the callback", async () => {
    const response = await request(app)
      .post(APPLE_SIGNIN_FORM_POST_PATH)
      .set("Origin", "https://evil.example");
    expect(response.status).toBe(403);
  });

  it("preserves credentialed CORS for the configured frontend", async () => {
    const origin = CONFIG.ORIGINS_ALLOWED[0];
    const response = await request(app)
      .post("/api/user/metadata")
      .set("Origin", origin);
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});
