import { CliValidator } from "@scripts/cli.validator";
import { Command } from "commander";

export default class CompassCLI {
  private program: Command;
  private validator: CliValidator;

  constructor(args: string[]) {
    this.program = this._createProgram();
    this.validator = new CliValidator(this.program);
    this.program.parse(args);
  }

  public async run() {
    const cmd = this.program.args[0];

    switch (true) {
      case cmd === "manage-failed-jobs": {
        const { runManageFailedJobs } = await import(
          "@scripts/commands/manage-failed-jobs"
        );
        await runManageFailedJobs();
        break;
      }
      case cmd === "purge-user": {
        const { runPurgeUser } = await import("@scripts/commands/purge-user");
        await runPurgeUser();
        break;
      }
      case cmd === "backfill-billing": {
        const { runBackfillBilling } = await import(
          "@scripts/commands/backfill-billing"
        );
        await runBackfillBilling();
        break;
      }
      case cmd === "backfill-identities": {
        const { runBackfillIdentities } = await import(
          "@scripts/commands/backfill-identities"
        );
        await runBackfillIdentities();
        break;
      }
      case cmd === "audit-connection-identity": {
        const { runAuditConnectionIdentity } = await import(
          "@scripts/commands/audit-connection-identity"
        );
        await runAuditConnectionIdentity();
        break;
      }
      case cmd === "encrypt-credentials": {
        const { runEncryptCredentials } = await import(
          "@scripts/commands/encrypt-credentials"
        );
        await runEncryptCredentials();
        break;
      }
      case cmd === "connection-report": {
        const { runConnectionReport } = await import(
          "@scripts/commands/connection-report"
        );
        await runConnectionReport();
        break;
      }
      case cmd === "apple-poll-throttle": {
        const { runApplePollThrottleCommand } = await import(
          "@scripts/commands/apple-poll-throttle"
        );
        await runApplePollThrottleCommand();
        break;
      }
      case cmd === "record-apple-contract": {
        const { runRecordAppleContractCommand } = await import(
          "@scripts/commands/record-apple-contract"
        );
        await runRecordAppleContractCommand();
        break;
      }
      case cmd === "email-preview": {
        const { runEmailPreviewCommand } = await import(
          "@scripts/commands/email-preview"
        );
        await runEmailPreviewCommand(process.argv.slice(3));
        break;
      }
      case cmd === "contracts:swift": {
        const { runContractsSwiftCommand } = await import(
          "@scripts/commands/contracts-swift"
        );
        runContractsSwiftCommand(process.argv.slice(3));
        break;
      }
      case cmd === "desktop:export": {
        const { runDesktopExportCommand } = await import(
          "@scripts/commands/desktop-export"
        );
        await runDesktopExportCommand(process.argv.slice(3));
        break;
      }
      default:
        this.validator.exitHelpfully(`${cmd as string} is not a supported cmd`);
    }
  }

  private _createProgram(): Command {
    const program = new Command();

    program.enablePositionalOptions(true).passThroughOptions(true);

    program
      .command("purge-user")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "delete every Compass row for one email, across the API db, Sync db, and SuperTokens (--apply to write)",
      );

    program
      .command("backfill-billing")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "stamp awaiting_checkout on accounts with no billing status (--apply to write)",
      );

    program
      .command("backfill-identities")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "copy google.googleId into identities[] for every user (--apply to write)",
      );

    program
      .command("audit-connection-identity")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "Report connected provider accounts that are another Compass user's login identity (read-only; optional --provider)",
      );

    program
      .command("encrypt-credentials")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "Encrypt legacy plaintext OAuth refresh tokens in Sync credentials (--apply to write)",
      );

    program
      .command("connection-report")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "Read-only report of Sync connections by provider, state, reason, and last activity",
      );

    program
      .command("apple-poll-throttle")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "Poll one iCloud calendar with sync-collection and record HTTP status codes (founder soak)",
      );

    program
      .command("record-apple-contract")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "Record redacted Apple CalDAV fixtures for the adapter contract suite (founder account)",
      );

    program
      .command("email-preview")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "render every welcome-sequence step to HTML and text files (--output <dir>)",
      );

    program
      .command("manage-failed-jobs")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "List/clear/requeue Sync jobs that exhausted the self-heal budget (list | clear | requeue)",
      );

    program
      .command("contracts:swift")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "Emit CompassKit Generated/Contracts.swift from core Zod schemas (--check to fail on drift)",
      );

    program
      .command("desktop:export")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "Emit CompassKit shortcuts, theme tokens, product events, and parity fixtures (--check to fail on drift)",
      );

    return program;
  }
}

if (require.main === module) {
  const cli = new CompassCLI(process.argv);

  cli.run().catch((err) => {
    console.log(err);
    process.exit(1);
  });
}
