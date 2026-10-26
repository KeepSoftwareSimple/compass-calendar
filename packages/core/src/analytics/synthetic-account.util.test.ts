import {
  emailMatchesSyntheticJourneyBase,
  isSyntheticAccountEmail,
  isSyntheticAccountHeaderValue,
} from "@core/analytics/synthetic-account.util";
import { describe, expect, it } from "bun:test";

describe("synthetic account helpers", () => {
  it("matches journey plus-address aliases to configured bases", () => {
    expect(
      emailMatchesSyntheticJourneyBase(
        "runner+journey173@example.com",
        "runner@example.com",
      ),
    ).toBe(true);
    expect(
      isSyntheticAccountEmail("runner+journey1@example.com", [
        "runner@example.com",
      ]),
    ).toBe(true);
    expect(
      isSyntheticAccountEmail("lance.essert+journey1730123456789@gmail.com", [
        "lance.essert@gmail.com",
      ]),
    ).toBe(true);
  });

  it("flags internal domains and compasscaltest.invalid", () => {
    expect(isSyntheticAccountEmail("tyler@keepsoftwaresimple.com")).toBe(true);
    expect(isSyntheticAccountEmail("x@compasscaltest.invalid")).toBe(true);
    expect(isSyntheticAccountEmail("real.user@gmail.com")).toBe(false);
  });

  it("reads the synthetic account request header", () => {
    expect(isSyntheticAccountHeaderValue("true")).toBe(true);
    expect(isSyntheticAccountHeaderValue(["1"])).toBe(true);
    expect(isSyntheticAccountHeaderValue("no")).toBe(false);
  });
});
