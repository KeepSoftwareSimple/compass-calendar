import { redactedCause } from "./redact-error";
import { assertNoSafetyCanary, findSafetyCanaryHit } from "./safety-canary";
import { describe, expect, it } from "bun:test";

describe("redactedCause", () => {
  it("returns undefined for non-Error values", () => {
    expect(redactedCause("boom")).toBeUndefined();
    expect(redactedCause(null)).toBeUndefined();
    expect(redactedCause({ message: "x" })).toBeUndefined();
  });

  it("keeps the message but drops request config that holds secrets", () => {
    const leaky = Object.assign(new Error("invalid_grant"), {
      config: {
        data: "client_secret=SUPER_SECRET&refresh_token=rt-xyz",
        headers: { Authorization: "Bearer ya29.super-secret-token" },
      },
      response: { data: { error: "invalid_grant" } },
    });

    const cause = redactedCause(leaky);
    expect(cause).toBeInstanceOf(Error);
    expect(cause?.message).toBe("invalid_grant");
    expect(cause).not.toBe(leaky);
    expect((cause as Error & { config?: unknown }).config).toBeUndefined();
    expect(cause?.name).toBe("Error");
    expect(cause?.stack).toBe(leaky.stack);
    expect(Object.hasOwn(cause, "config")).toBe(false);
    expect(Object.hasOwn(cause, "response")).toBe(false);
    assertNoSafetyCanary({
      message: cause?.message,
      cause,
      leakyKeys: Object.keys(cause ?? {}),
    });
  });

  it("keeps a gaxios-style error's name and stack and drops config", () => {
    const leaky = Object.assign(
      new Error("Request failed with status code 500"),
      {
        name: "GaxiosError",
        config: { url: "https://www.googleapis.com/calendar/v3/calendars" },
        response: { status: 500 },
      },
    );
    leaky.stack =
      "GaxiosError: Request failed with status code 500\n    at Google.watch";

    const cause = redactedCause(leaky);
    expect(cause?.name).toBe("GaxiosError");
    expect(cause?.stack).toBe(leaky.stack);
    expect((cause as Error & { config?: unknown }).config).toBeUndefined();
    expect(Object.hasOwn(cause as object, "response")).toBe(false);
  });
});

describe("safety canaries", () => {
  it("detects bearer and oauth secret shapes", () => {
    expect(
      findSafetyCanaryHit({ headers: { Authorization: "Bearer abc.def" } }),
    ).toMatch(/^secret:/);
    expect(findSafetyCanaryHit("client_secret=SUPER_SECRET&code=auth")).toMatch(
      /^secret:/,
    );
    expect(findSafetyCanaryHit({ refresh_token: "1//rt" })).toMatch(/^secret:/);
  });

  it("detects event-content shapes that must stay out of feeds/logs", () => {
    expect(
      findSafetyCanaryHit({ title: "Team standup", description: "" }),
    ).toMatch(/^eventContent:/);
    expect(
      findSafetyCanaryHit({ attendees: [{ email: "a@example.com" }] }),
    ).toMatch(/^eventContent:/);
  });

  it("detects People-API-shaped contact data (WP-05)", () => {
    // A person payload serialized into a log or error cause is a contact leak.
    expect(
      findSafetyCanaryHit({
        person: { emailAddresses: [{ value: "a@example.com" }] },
      }),
    ).toMatch(/^eventContent:/);
    // So is a suggestion list.
    expect(
      findSafetyCanaryHit({
        suggestions: [{ email: "a@example.com", displayName: "A" }],
      }),
    ).toMatch(/^eventContent:/);
    // But an empty suggestions list (the under-min-length response) and a
    // plain count are shape-only — no contact content to protect.
    assertNoSafetyCanary({ suggestions: [] });
    assertNoSafetyCanary({ suggestionCount: 3 });
  });

  it("allows id-only invalidation envelopes", () => {
    assertNoSafetyCanary({
      kind: "calendar",
      connectionId: "6a63dc614f8ab7ae0cc9656a",
      calendarId: "6a63e568847fa073e9cf6273",
    });
    assertNoSafetyCanary({
      kind: "event",
      eventId: "6a63e568847fa073e9cf6279",
      calendarId: "6a63e568847fa073e9cf6273",
    });
  });
});
