import superTokensNode from "supertokens-node";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import {
  restoreFileMocks,
  teardownBackendTestSeams,
} from "@backend/__tests__/helpers/mock.setup";
import { waitForSupertokensCore } from "@backend/__tests__/helpers/supertokens-test-core";
import { resetSupertokensStores } from "@backend/auth/ports/supertokens.registry";
import { resetVerifySession } from "@backend/auth/session/session.middleware";
import { CONFIG } from "@backend/common/constants/config.constants";
import { initExpressServer } from "@backend/servers/express/express.server";
import { SSE_RETRY_HINT_MS } from "@backend/servers/sse/sse.server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { randomUUID } from "node:crypto";
import http from "node:http";

const HEADER_AUTH_MODE = "header";
const ACCESS_TOKEN_HEADER = "st-access-token";
const REFRESH_TOKEN_HEADER = "st-refresh-token";
const FRONT_TOKEN_HEADER = "front-token";

function headerValue(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
}

describe("header sessions for native clients", () => {
  let httpServer: http.Server | undefined;
  let serverUri: string;
  const originalSupertokensUri = CONFIG.SUPERTOKENS_URI;
  const originalSupertokensKey = CONFIG.SUPERTOKENS_KEY;

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    resetSupertokensStores();
    resetVerifySession();
    await waitForSupertokensCore();

    CONFIG.SUPERTOKENS_URI =
      process.env["SUPERTOKENS_URI"] ?? "http://127.0.0.1:3567";
    CONFIG.SUPERTOKENS_KEY =
      process.env["SUPERTOKENS_KEY"] ?? "local-dev-supertokens-key";

    const initMock = superTokensNode.init as {
      mockRestore?: () => void;
    };
    initMock.mockRestore?.();

    const app = initExpressServer();
    httpServer = http.createServer(app);
    serverUri = await new Promise((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1");
      httpServer.once("listening", () => {
        const address = httpServer.address();
        if (address && typeof address === "object") {
          resolve(`http://127.0.0.1:${address.port}`);
          return;
        }
        reject(new Error("Could not resolve test server address"));
      });
      httpServer.once("error", reject);
    });
  });

  beforeEach(() => {
    resetSupertokensStores();
    resetVerifySession();
    return cleanupCollections();
  });

  afterAll(async () => {
    if (!httpServer) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    CONFIG.SUPERTOKENS_URI = originalSupertokensUri;
    CONFIG.SUPERTOKENS_KEY = originalSupertokensKey;
    restoreFileMocks();
    teardownBackendTestSeams();
    await cleanupTestDb();
  });

  it("signs in with header mode, refreshes tokens, opens SSE with Bearer, and signs out", async () => {
    const email = `header-${randomUUID()}@example.com`;
    const password = "HeaderSessionTestPassword1!";
    const name = "Header Session Test";

    const signUpResponse = await fetch(`${serverUri}/api/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "st-auth-mode": HEADER_AUTH_MODE,
      },
      body: JSON.stringify({
        formFields: [
          { id: "email", value: email },
          { id: "password", value: password },
          { id: "name", value: name },
        ],
      }),
    });
    expect(signUpResponse.status).toBe(200);

    const signInResponse = await fetch(`${serverUri}/api/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "st-auth-mode": HEADER_AUTH_MODE,
      },
      body: JSON.stringify({
        formFields: [
          { id: "email", value: email },
          { id: "password", value: password },
        ],
      }),
    });

    expect(signInResponse.status).toBe(200);
    const accessToken = headerValue(
      signInResponse.headers,
      ACCESS_TOKEN_HEADER,
    );
    const refreshToken = headerValue(
      signInResponse.headers,
      REFRESH_TOKEN_HEADER,
    );
    const frontToken = headerValue(signInResponse.headers, FRONT_TOKEN_HEADER);
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(frontToken).toBeTruthy();

    const profileResponse = await fetch(`${serverUri}/api/user/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "st-auth-mode": HEADER_AUTH_MODE,
      },
    });
    const profileBody = await profileResponse.text();
    expect(profileResponse.status, profileBody).toBe(200);
    const profile = JSON.parse(profileBody) as { email?: string };
    expect(profile.email?.toLowerCase()).toBe(email.toLowerCase());

    const refreshResponse = await fetch(`${serverUri}/api/session/refresh`, {
      method: "POST",
      headers: {
        "st-auth-mode": HEADER_AUTH_MODE,
        Authorization: `Bearer ${refreshToken}`,
      },
    });
    const refreshBody = await refreshResponse.text();
    expect(refreshResponse.status, refreshBody).toBe(200);
    const rotatedAccess = headerValue(
      refreshResponse.headers,
      ACCESS_TOKEN_HEADER,
    );
    const rotatedRefresh = headerValue(
      refreshResponse.headers,
      REFRESH_TOKEN_HEADER,
    );
    expect(rotatedAccess).toBeTruthy();
    expect(rotatedRefresh).toBeTruthy();
    expect(rotatedAccess).not.toBe(accessToken);
    expect(rotatedRefresh).not.toBe(refreshToken);

    const streamController = new AbortController();
    const streamResponse = await fetch(`${serverUri}/api/events/stream`, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${rotatedAccess}`,
      },
      signal: streamController.signal,
    });
    expect(streamResponse.status).toBe(200);

    const reader = streamResponse.body?.getReader();
    expect(reader).toBeTruthy();
    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes("retry:")) {
      const { done, value } = await reader!.read();
      if (done) {
        break;
      }
      received += decoder.decode(value, { stream: true });
    }
    streamController.abort();
    expect(received).toContain(`retry: ${SSE_RETRY_HINT_MS}`);

    const signOutResponse = await fetch(`${serverUri}/api/signout`, {
      method: "POST",
      headers: {
        "st-auth-mode": HEADER_AUTH_MODE,
        Authorization: `Bearer ${rotatedAccess}`,
        "st-refresh-token": rotatedRefresh ?? "",
      },
    });
    expect(signOutResponse.status).toBe(200);

    const profileAfterSignOut = await fetch(`${serverUri}/api/user/profile`, {
      headers: {
        Authorization: `Bearer ${rotatedAccess}`,
      },
    });
    expect(profileAfterSignOut.status).toBe(401);
  });
});
