import {
  EMAIL_SEND_BATCH_SIZE,
  EMAIL_SEND_CLAIM_LEASE_MS,
  EMAIL_SEND_MAX_ATTEMPTS,
  EMAIL_SEND_POLL_INTERVAL_MS,
  emailSendBackoffMs,
} from "@backend/email/email.constants";
import { describe, expect, it } from "bun:test";

describe("email send loop constants", () => {
  it("pins poll, lease, batch, and attempt-cap tuning", () => {
    expect(EMAIL_SEND_POLL_INTERVAL_MS).toBe(60_000);
    expect(EMAIL_SEND_CLAIM_LEASE_MS).toBe(120_000);
    expect(EMAIL_SEND_BATCH_SIZE).toBe(50);
    expect(EMAIL_SEND_MAX_ATTEMPTS).toBe(5);
  });
});

describe("emailSendBackoffMs", () => {
  it("doubles from one minute up to the cap", () => {
    expect(emailSendBackoffMs(0)).toBe(60_000);
    expect(emailSendBackoffMs(1)).toBe(120_000);
    expect(emailSendBackoffMs(8)).toBe(30 * 60 * 1000);
    expect(emailSendBackoffMs(20)).toBe(30 * 60 * 1000);
  });
});
