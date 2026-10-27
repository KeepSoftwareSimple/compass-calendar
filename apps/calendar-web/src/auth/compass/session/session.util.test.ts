import {
  getUserId,
  UNAUTHENTICATED_USER,
  waitForAuthSession,
} from "@web/auth/compass/session/session.util";
import { session } from "./Session";
import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

const mockDoesSessionExist = spyOn(session, "doesSessionExist");
const mockGetAccessTokenPayloadSecurely = spyOn(
  session,
  "getAccessTokenPayloadSecurely",
);

// bun never restores a spy on its own, and these live at module scope: without
// this they stay installed on supertokens' session module for every later file.
afterAll(() => {
  mockDoesSessionExist.mockRestore();
  mockGetAccessTokenPayloadSecurely.mockRestore();
});

describe("session.util", () => {
  beforeEach(() => {
    mockDoesSessionExist.mockClear();
    mockGetAccessTokenPayloadSecurely.mockClear();
  });

  describe("waitForAuthSession", () => {
    it("returns true immediately in e2e test mode without calling SuperTokens", async () => {
      const previous = globalThis.window;
      globalThis.window = {
        __COMPASS_E2E_TEST__: true,
      } as Window & typeof globalThis.window;

      await expect(waitForAuthSession({ timeoutMs: 80 })).resolves.toBe(true);
      expect(mockDoesSessionExist).not.toHaveBeenCalled();

      globalThis.window = previous;
    });

    it("returns true as soon as doesSessionExist succeeds", async () => {
      mockDoesSessionExist.mockResolvedValueOnce(false).mockResolvedValue(true);

      await expect(
        waitForAuthSession({ timeoutMs: 500, intervalMs: 10 }),
      ).resolves.toBe(true);
      expect(mockDoesSessionExist.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("returns false when the session never appears", async () => {
      mockDoesSessionExist.mockResolvedValue(false);

      await expect(
        waitForAuthSession({ timeoutMs: 80, intervalMs: 20 }),
      ).resolves.toBe(false);
    });
  });

  describe("getUserId", () => {
    it("should return UNAUTHENTICATED_USER when session does not exist", async () => {
      mockDoesSessionExist.mockResolvedValue(false);

      const userId = await getUserId();

      expect(userId).toBe(UNAUTHENTICATED_USER);
      expect(mockDoesSessionExist).toHaveBeenCalledTimes(1);
      expect(mockGetAccessTokenPayloadSecurely).not.toHaveBeenCalled();
    });

    it("should return actual userId when session exists", async () => {
      const mockUserId = "authenticated-user-id";
      mockDoesSessionExist.mockResolvedValue(true);
      mockGetAccessTokenPayloadSecurely.mockResolvedValue({
        sub: mockUserId,
      });

      const userId = await getUserId();

      expect(userId).toBe(mockUserId);
      expect(mockDoesSessionExist).toHaveBeenCalledTimes(1);
      expect(mockGetAccessTokenPayloadSecurely).toHaveBeenCalledTimes(1);
    });
  });
});
