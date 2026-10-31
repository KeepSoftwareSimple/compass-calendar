import { resolveJourneySyntheticCleanupEmails } from "@scripts/commands/journey-synthetic-cleanup";
import { assertAllowedSyntheticJourneyCleanupEmails } from "@core/journey/synthetic-journey-cleanup-email.util";
import { describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const STAGING_PENDING_PATH = join(
  process.cwd(),
  "e2e",
  "test-results",
  "staging-journey",
  "journey-pending-account.json",
);

const stagingEmail = "lance.essert+journey1793475794523@gmail.com";

describe("journey-synthetic-cleanup email resolution", () => {
  it("rejects non-synthetic emails for staging", () => {
    expect(() =>
      assertAllowedSyntheticJourneyCleanupEmails(
        ["someone@example.com"],
        "staging",
      ),
    ).toThrow(/does not match the allowed staging synthetic journey pattern/);
  });

  it("resolves email from pending file when discover is enabled", async () => {
    await mkdir(join(process.cwd(), "e2e/test-results/staging-journey"), {
      recursive: true,
    });
    await writeFile(
      STAGING_PENDING_PATH,
      `${JSON.stringify({ email: stagingEmail })}\n`,
      "utf8",
    );

    const emails = await resolveJourneySyntheticCleanupEmails([
      "--environment",
      "staging",
      "--discover-pending-file",
    ]);
    expect(emails).toEqual([stagingEmail]);

    await rm(STAGING_PENDING_PATH, { force: true });
  });

  it("keeps resolved email after pending file is removed (post UI cleanup)", async () => {
    const argv = [
      "--environment",
      "staging",
      "--discover-pending-file",
      "--emails",
      stagingEmail,
    ];

    await rm(STAGING_PENDING_PATH, { force: true });

    const emails = await resolveJourneySyntheticCleanupEmails(argv);
    expect(emails).toEqual([stagingEmail]);
  });

  it("requires emails or pending file when discover finds nothing", async () => {
    await rm(STAGING_PENDING_PATH, { force: true });

    await expect(
      resolveJourneySyntheticCleanupEmails([
        "--environment",
        "staging",
        "--discover-pending-file",
      ]),
    ).rejects.toThrow(
      "journey-synthetic-cleanup requires --emails or --discover-pending-file with a pending account file",
    );
  });
});
