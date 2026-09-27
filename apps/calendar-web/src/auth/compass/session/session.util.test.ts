import { UNAUTHENTICATED_USER } from "@web/auth/compass/session/session.util";
import { session } from "./Session";
import { getUserId } from "./session.util";
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
