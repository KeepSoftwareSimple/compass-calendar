import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { CONFIG } from "@backend/common/constants/config.constants";
import { requestDesktopReminder } from "@backend/landing/desktop-reminder.controller";
import { renderDesktopReminderEmail } from "@backend/landing/desktop-reminder.email";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  spyOn,
} from "bun:test";

const post = async (body: unknown) => {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as Response;
  await requestDesktopReminder({ body } as Request, res);
  return captured;
};

describe("POST /api/landing/desktop-reminder", () => {
  const originalKey = CONFIG.KIT_API_KEY;
  const originalAllowlist = CONFIG.EMAIL_ALLOWLIST;
  let fetchSpy: Mock<typeof fetch>;

  beforeEach(() => {
    CONFIG.KIT_API_KEY = "kit-test-key";
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ subscriber: { id: 1 } }), { status: 201 }),
    );
  });

  afterEach(() => {
    CONFIG.KIT_API_KEY = originalKey;
    CONFIG.EMAIL_ALLOWLIST = originalAllowlist;
    fetchSpy.mockRestore();
  });

  it("adds the visitor to Kit as a subscriber and answers ok", async () => {
    const result = await post({ email: "  Visitor@Example.com " });

    expect(result).toEqual({ status: Status.OK, body: { ok: true } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://api.kit.com/v4/subscribers");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-Kit-Api-Key": "kit-test-key",
    });
    expect(init?.body).toBe(
      JSON.stringify({ email_address: "visitor@example.com" }),
    );
  });

  it("rejects a malformed address without calling Kit", async () => {
    const result = await post({ email: "not-an-email" });

    expect(result).toEqual({
      status: Status.BAD_REQUEST,
      body: { error: "invalid_email" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is off when no Kit key is configured", async () => {
    CONFIG.KIT_API_KEY = undefined;

    const result = await post({ email: "visitor@example.com" });

    expect(result).toEqual({
      status: Status.SERVICE_UNAVAILABLE,
      body: { error: "not_configured" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a failure when Kit refuses the subscriber", async () => {
    fetchSpy.mockResolvedValue(new Response("{}", { status: 401 }));

    const result = await post({ email: "visitor@example.com" });

    expect(result).toEqual({
      status: Status.BAD_GATEWAY,
      body: { error: "send_failed" },
    });
  });
});

describe("renderDesktopReminderEmail", () => {
  it("links to the calendar on the configured frontend", () => {
    const email = renderDesktopReminderEmail(
      "https://www.compasscalendar.com/",
    );

    expect(email.subject).toBe("Your link to Compass Calendar");
    expect(email.text).toContain(
      "Open Compass: https://www.compasscalendar.com/week?utm_source=email&utm_campaign=desktop-reminder",
    );
    expect(email.html).toContain(
      'href="https://www.compasscalendar.com/week?utm_source=email&amp;utm_campaign=desktop-reminder"',
    );
  });
});
