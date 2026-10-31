import {
  assertAllowedSyntheticJourneyCleanupEmails,
  isAllowedSyntheticJourneyCleanupEmail,
} from "@core/journey/synthetic-journey-cleanup-email.util";
import { describe, expect, it } from "bun:test";

describe("synthetic journey cleanup email patterns", () => {
  it("allows Tyler-approved production journey addresses", () => {
    expect(
      isAllowedSyntheticJourneyCleanupEmail(
        "lance.essert+prod-journey-google+journey1730123456789@gmail.com",
        "production",
      ),
    ).toBe(true);
  });

  it("rejects production cleanup for staging-only addresses", () => {
    expect(
      isAllowedSyntheticJourneyCleanupEmail(
        "lance.essert+journey1730123456789@gmail.com",
        "production",
      ),
    ).toBe(false);
  });

  it("allows staging journey addresses only in staging", () => {
    expect(
      isAllowedSyntheticJourneyCleanupEmail(
        "lance.essert+journey1730123456789@gmail.com",
        "staging",
      ),
    ).toBe(true);
    expect(
      isAllowedSyntheticJourneyCleanupEmail(
        "lance.essert+prod-journey-google+journey1@gmail.com",
        "staging",
      ),
    ).toBe(false);
  });

  it("fails the whole batch before any action when one email is invalid", () => {
    expect(() =>
      assertAllowedSyntheticJourneyCleanupEmails(
        [
          "lance.essert+journey1730123456789@gmail.com",
          "not-an-approved-address@example.com",
        ],
        "staging",
      ),
    ).toThrow(/Refusing cleanup/);
  });
});
