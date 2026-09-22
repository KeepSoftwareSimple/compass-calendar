import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@backend/email/unsubscribe-token";
import { describe, expect, it } from "bun:test";

describe("unsubscribe token", () => {
  const secret = "test-unsubscribe-secret";

  it("round-trips a user id", () => {
    const userId = "507f1f77bcf86cd799439011";
    const token = createUnsubscribeToken(userId, secret);
    expect(verifyUnsubscribeToken(token, secret)).toBe(userId);
  });

  it("rejects a tampered token", () => {
    const userId = "507f1f77bcf86cd799439011";
    const token = createUnsubscribeToken(userId, secret);
    const tampered = `${token}x`;
    expect(verifyUnsubscribeToken(tampered, secret)).toBeNull();
  });
});
