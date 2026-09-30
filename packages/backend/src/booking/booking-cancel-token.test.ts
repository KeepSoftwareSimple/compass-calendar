import {
  guestActionTokenAuthorizes,
  guestActionTokenIsLive,
  guestReadTokenAuthorizes,
  hashCancelToken,
  verifyCancelToken,
} from "@backend/booking/booking-cancel-token";
import { describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";

describe("guestActionTokenIsLive", () => {
  const slotEnd = new Date("2026-09-07T10:30:00.000Z");

  it("is live before slotEnd and expired at and after slotEnd", () => {
    expect(
      guestActionTokenIsLive(slotEnd, new Date("2026-09-07T10:29:59.999Z")),
    ).toBe(true);
    expect(guestActionTokenIsLive(slotEnd, slotEnd)).toBe(false);
    expect(
      guestActionTokenIsLive(slotEnd, new Date("2026-09-07T10:30:00.001Z")),
    ).toBe(false);
  });
});

describe("guestActionTokenAuthorizes", () => {
  const token = randomBytes(32).toString("base64url");
  const hash = hashCancelToken(token);
  const slotEnd = new Date("2026-09-07T10:30:00.000Z");

  it("authorizes a matching live token and rejects expired or wrong tokens", () => {
    expect(
      guestActionTokenAuthorizes(
        hash,
        token,
        slotEnd,
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      guestActionTokenAuthorizes(
        hash,
        token,
        slotEnd,
        new Date("2026-09-07T10:30:00.000Z"),
      ),
    ).toBe(false);
    expect(
      guestActionTokenAuthorizes(
        hash,
        `${token}x`,
        slotEnd,
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    ).toBe(false);
    expect(verifyCancelToken(hash, token)).toBe(true);
  });
});

describe("guestReadTokenAuthorizes", () => {
  const token = randomBytes(32).toString("base64url");
  const hash = hashCancelToken(token);
  const slotEnd = new Date("2026-09-07T10:30:00.000Z");

  it("authorizes a matching token after slotEnd", () => {
    expect(guestReadTokenAuthorizes(hash, token)).toBe(true);
    expect(guestReadTokenAuthorizes(hash, token)).toBe(true);
    expect(
      guestActionTokenAuthorizes(
        hash,
        token,
        slotEnd,
        new Date("2026-09-07T11:00:00.000Z"),
      ),
    ).toBe(false);
    expect(guestReadTokenAuthorizes(hash, `${token}x`)).toBe(false);
  });
});
