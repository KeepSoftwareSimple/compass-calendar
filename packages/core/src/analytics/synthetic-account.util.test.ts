import {
  emailMatchesSyntheticJourneyBase,
  isBillingAutomationBypassEmail,
  isSyntheticAccountEmail,
  isSyntheticAccountHeaderValue,
  redactJourneyEmailForLog,
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
    expect(
      isSyntheticAccountEmail(
        "lance.essert+prod-journey-google+journey1730123456789@gmail.com",
        ["lance.essert+prod-journey-google@gmail.com"],
      ),
    ).toBe(true);
  });

  it("flags internal domains and compasscaltest.invalid", () => {
    expect(isSyntheticAccountEmail("tyler@keepsoftwaresimple.com")).toBe(true);
    expect(isSyntheticAccountEmail("x@compasscaltest.invalid")).toBe(true);
    expect(isSyntheticAccountEmail("real.user@gmail.com")).toBe(false);
  });

  it("keeps compasscaltest.invalid on the real billing path unless +journey", () => {
    expect(isBillingAutomationBypassEmail("x@compasscaltest.invalid")).toBe(
      false,
    );
    expect(
      isBillingAutomationBypassEmail("x+journey1@compasscaltest.invalid"),
    ).toBe(true);
    expect(isSyntheticAccountEmail("x@compasscaltest.invalid")).toBe(true);
  });

  it("reads the synthetic account request header", () => {
    expect(isSyntheticAccountHeaderValue("true")).toBe(true);
    expect(isSyntheticAccountHeaderValue(["1"])).toBe(true);
    expect(isSyntheticAccountHeaderValue("no")).toBe(false);
  });

  it("redacts journey addresses for logs but keeps +journey digits", () => {
    expect(
      redactJourneyEmailForLog(
        "runner+prod-journey-google+journey1730123456789@gmail.com",
      ),
    ).toBe("runner+***+journey1730123456789@gmail.com");
    expect(
      redactJourneyEmailForLog("lance.essert+journey1730123456789@gmail.com"),
    ).toBe("lance.essert+journey1730123456789@gmail.com");
  });
});
