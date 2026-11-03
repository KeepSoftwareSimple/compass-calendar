import {
  assertAllowedSyntheticJourneyCleanupEmails,
  isAllowedSyntheticJourneyCleanupEmail,
  journeyPendingAccountResultsSubdir,
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

  it("rejects production cleanup for arbitrary non-matching emails", () => {
    expect(
      isAllowedSyntheticJourneyCleanupEmail(
        "someone@example.com",
        "production",
      ),
    ).toBe(false);
    expect(() =>
      assertAllowedSyntheticJourneyCleanupEmails(
        ["someone@example.com"],
        "production",
      ),
    ).toThrow(/Refusing cleanup.*production/);
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

  it("maps environments to the pending-account results subdirectory", () => {
    expect(journeyPendingAccountResultsSubdir("production")).toBe(
      "prod-journey",
    );
    expect(journeyPendingAccountResultsSubdir("staging")).toBe(
      "staging-journey",
    );
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
