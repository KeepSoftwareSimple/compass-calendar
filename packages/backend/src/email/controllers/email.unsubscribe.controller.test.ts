import { ObjectId } from "mongodb";
import { Status } from "@core/errors/status.codes";
import { CONFIG } from "@backend/common/constants/config.constants";
import emailUnsubscribeController from "@backend/email/controllers/email.unsubscribe.controller";
import { createUnsubscribeToken } from "@backend/email/unsubscribe-token";
import { afterEach, describe, expect, it, mock } from "bun:test";

describe("EmailUnsubscribeController", () => {
  const originalSecret = CONFIG.EMAIL_UNSUBSCRIBE_SECRET;

  afterEach(() => {
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = originalSecret;
  });

  it("GET renders confirmation without mutating the user", async () => {
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "secret";
    const userId = new ObjectId();
    const token = createUnsubscribeToken(userId.toHexString(), "secret");

    const req = { query: { token } } as never;
    let body = "";
    const res = {
      status: mock(() => res),
      type: mock(() => res),
      send: mock((value: string) => {
        body = value;
      }),
    };

    await emailUnsubscribeController.showConfirmation(req, res as never);

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(body).toContain("Unsubscribe from Compass emails");
  });

  it("opens reflection controls in app settings without unsubscribing on GET", async () => {
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "secret";
    const token = createUnsubscribeToken(
      new ObjectId().toHexString(),
      "secret",
    );
    const res = { redirect: mock(() => {}) };
    await emailUnsubscribeController.showConfirmation(
      { query: { token, scope: "reflection" } } as never,
      res as never,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      new URL("/?settings=notifications", CONFIG.FRONTEND_URL).toString(),
    );
  });
  it("renders a friendly page for an invalid token", async () => {
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "secret";
    const req = { query: { token: "not-valid" } } as never;
    let body = "";
    const res = {
      status: mock(() => res),
      type: mock(() => res),
      send: mock((value: string) => {
        body = value;
      }),
    };

    await emailUnsubscribeController.showConfirmation(req, res as never);

    expect(body).toContain("no longer valid");
    expect(res.status).toHaveBeenCalledWith(Status.OK);
  });
});
