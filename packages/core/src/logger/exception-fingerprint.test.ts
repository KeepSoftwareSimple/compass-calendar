import {
  exceptionFingerprint,
  normalizeExceptionMessage,
} from "@core/logger/exception-fingerprint";
import { describe, expect, it } from "bun:test";

describe("exceptionFingerprint", () => {
  it("shares a fingerprint when messages differ only by ids", () => {
    const name = "ZodError";
    const a = exceptionFingerprint(
      name,
      "Unrecognized key: lastFullListAt on 6a63dc614f8ab7ae0cc9656a",
    );
    const b = exceptionFingerprint(
      name,
      "Unrecognized key: lastFullListAt on 6a63e568847fa073e9cf6273",
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when the class name differs and the message is the same", () => {
    const message = "request failed";
    expect(exceptionFingerprint("TypeError", message)).not.toBe(
      exceptionFingerprint("Error", message),
    );
  });

  it("normalizes uuids, timestamps, attempt counters, and long integers", () => {
    expect(
      normalizeExceptionMessage(
        "retry attempt 3 at 2026-09-13T01:16:00.000Z id 550e8400-e29b-41d4-a716-446655440000 status 50312",
      ),
    ).toBe("retry attempt <n> at <timestamp> id <uuid> status <n>");
  });
});
