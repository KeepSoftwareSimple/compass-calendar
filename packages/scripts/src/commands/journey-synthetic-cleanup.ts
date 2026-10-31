import { runStripeSyntheticJourneyCleanup } from "@scripts/commands/journey-synthetic-cleanup/stripe";
import { redactJourneyEmailForLog } from "@core/analytics/synthetic-account.util";
import {
  assertAllowedSyntheticJourneyCleanupEmails,
  type JourneyCleanupEnvironment,
} from "@core/journey/synthetic-journey-cleanup-email.util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function parseArgs(argv: string[]): {
  environment: JourneyCleanupEnvironment;
  emails: string[];
  dryRun: boolean;
  discoverPendingFile: boolean;
  stripeOnly: boolean;
  validateOnly: boolean;
} {
  const envFlag = argv.indexOf("--environment");
  const environment = argv[envFlag + 1]?.trim() as JourneyCleanupEnvironment;
  if (environment !== "staging" && environment !== "production") {
    throw new Error(
      "journey-synthetic-cleanup requires --environment staging|production",
    );
  }

  const emailsFlag = argv.indexOf("--emails");
  const emailsRaw = emailsFlag >= 0 ? argv[emailsFlag + 1]?.trim() : "";
  const emails = emailsRaw
    ? emailsRaw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  return {
    environment,
    emails,
    dryRun: !argv.includes("--apply"),
    discoverPendingFile: argv.includes("--discover-pending-file"),
    stripeOnly: argv.includes("--stripe-only"),
    validateOnly: argv.includes("--validate-only"),
  };
}

async function discoverPendingEmail(
  environment: JourneyCleanupEnvironment,
): Promise<string | null> {
  const scopeDir =
    environment === "production" ? "prod-journey" : "staging-journey";
  const path = join(
    process.cwd(),
    "e2e",
    "test-results",
    scopeDir,
    "journey-pending-account.json",
  );
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { email?: string };
    return parsed.email?.trim() ?? null;
  } catch {
    return null;
  }
}

async function resolveEmails(
  args: ReturnType<typeof parseArgs>,
): Promise<string[]> {
  let emails = [...args.emails];
  if (emails.length === 0 && args.discoverPendingFile) {
    const discovered = await discoverPendingEmail(args.environment);
    if (discovered) emails = [discovered];
  }
  if (emails.length === 0) {
    throw new Error(
      "journey-synthetic-cleanup requires --emails or --discover-pending-file with a pending account file",
    );
  }
  return emails;
}

export async function runJourneySyntheticCleanup(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  const emails = await resolveEmails(args);
  assertAllowedSyntheticJourneyCleanupEmails(emails, args.environment);

  if (args.validateOnly) {
    for (const email of emails) {
      console.log(
        `journey-cleanup email=${redactJourneyEmailForLog(email)} action=validated`,
      );
    }
    process.exit(0);
  }

  if (args.stripeOnly) {
    if (args.dryRun) {
      throw new Error("--stripe-only requires --apply");
    }
    const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();
    if (!secretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is required for Stripe cleanup (--apply --stripe-only)",
      );
    }
    await runStripeSyntheticJourneyCleanup({
      emails,
      environment: args.environment,
      dryRun: false,
      secretKey,
    });
    process.exit(0);
  }

  for (const email of emails) {
    console.log(
      `journey-cleanup email=${redactJourneyEmailForLog(email)} action=${args.dryRun ? "would_delete_compass_account" : "compass_account_delete_scheduled"}`,
    );
  }

  const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();
  if (!secretKey) {
    for (const email of emails) {
      console.log(
        `journey-cleanup email=${redactJourneyEmailForLog(email)} action=stripe_skipped_no_secret_key`,
      );
    }
    process.exit(0);
  }

  await runStripeSyntheticJourneyCleanup({
    emails,
    environment: args.environment,
    dryRun: args.dryRun,
    secretKey,
  });
  process.exit(0);
}
