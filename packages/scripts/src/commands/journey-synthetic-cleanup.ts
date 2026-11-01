import { redactJourneyEmailForLog } from "@core/analytics/synthetic-account.util";
import {
  assertAllowedSyntheticJourneyCleanupEmails,
  type JourneyCleanupEnvironment,
  journeyPendingAccountResultsSubdir,
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

function logJourneyCleanup(
  email: string,
  fields: Readonly<Record<string, string>>,
): void {
  const extras = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(
    `journey-cleanup email=${redactJourneyEmailForLog(email)} ${extras}`,
  );
}

function logStripeLegSkipped(emails: readonly string[]): void {
  for (const email of emails) {
    logJourneyCleanup(email, {
      stripe_leg: "skipped (app delete handles customer)",
    });
  }
}

async function invokeStripeCleanup(input: {
  emails: readonly string[];
  environment: JourneyCleanupEnvironment;
  dryRun: boolean;
  secretKey: string;
}): Promise<void> {
  const { runJourneySyntheticStripeCleanup } = await import(
    "@backend/billing/services/journey-synthetic-stripe-cleanup.service"
  );
  await runJourneySyntheticStripeCleanup(input);
}

async function discoverPendingEmail(
  environment: JourneyCleanupEnvironment,
): Promise<string | null> {
  const path = join(
    process.cwd(),
    "e2e",
    "test-results",
    journeyPendingAccountResultsSubdir(environment),
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

export async function resolveJourneySyntheticCleanupEmails(
  argv: string[],
): Promise<string[]> {
  return resolveEmails(parseArgs(argv));
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
      logJourneyCleanup(email, { action: "validated" });
    }
    process.exit(0);
  }

  if (args.stripeOnly) {
    if (args.dryRun) {
      throw new Error("--stripe-only requires --apply");
    }
    const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();
    if (!secretKey) {
      logStripeLegSkipped(emails);
      process.exit(0);
    }
    await invokeStripeCleanup({
      emails,
      environment: args.environment,
      dryRun: false,
      secretKey,
    });
    process.exit(0);
  }

  for (const email of emails) {
    logJourneyCleanup(email, {
      action: args.dryRun
        ? "would_delete_compass_account"
        : "compass_account_delete_scheduled",
    });
  }

  const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();
  if (!secretKey) {
    logStripeLegSkipped(emails);
    process.exit(0);
  }

  await invokeStripeCleanup({
    emails,
    environment: args.environment,
    dryRun: args.dryRun,
    secretKey,
  });
  process.exit(0);
}
