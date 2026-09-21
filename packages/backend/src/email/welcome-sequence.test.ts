import { ObjectId } from "mongodb";
import {
  buildWelcomeEnrollmentRows,
  computeSendAt,
  WELCOME_SEQUENCE,
} from "@backend/email/welcome-sequence";
import { describe, expect, it } from "bun:test";

describe("welcome sequence scheduling", () => {
  const signedUpAt = new Date("2026-01-01T12:00:00.000Z");

  it("builds one queued row per step for a new signup", () => {
    const userId = new ObjectId();
    const rows = buildWelcomeEnrollmentRows(userId, signedUpAt, "real");

    expect(rows).toHaveLength(WELCOME_SEQUENCE.length);
    expect(rows.map((row) => row.stepKey)).toEqual(
      WELCOME_SEQUENCE.map((step) => step.key),
    );
    for (const row of rows) {
      expect(row._id).toBe(`${userId.toHexString()}:${row.stepKey}`);
      expect(row.status).toBe("queued");
      expect(row.sequence).toBe("welcome");
    }
  });

  it("spaces real profile sendAt values by whole days", () => {
    const welcome = computeSendAt(signedUpAt, WELCOME_SEQUENCE[0]!, "real");
    const shortcuts = computeSendAt(signedUpAt, WELCOME_SEQUENCE[1]!, "real");

    expect(welcome.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(shortcuts.toISOString()).toBe("2026-01-03T12:00:00.000Z");
  });

  it("spaces fast profile sendAt values by minutes", () => {
    const welcome = computeSendAt(signedUpAt, WELCOME_SEQUENCE[0]!, "fast");
    const shortcuts = computeSendAt(signedUpAt, WELCOME_SEQUENCE[1]!, "fast");

    expect(welcome.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(shortcuts.toISOString()).toBe("2026-01-01T12:02:00.000Z");
  });
});
