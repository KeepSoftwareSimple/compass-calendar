import { CliValidator } from "@scripts/cli.validator";
import { runApplePollThrottleCommand } from "@scripts/commands/apple-poll-throttle";
import { runAuditConnectionIdentity } from "@scripts/commands/audit-connection-identity";
import { runBackfillBilling } from "@scripts/commands/backfill-billing";
import { runBackfillIdentities } from "@scripts/commands/backfill-identities";
import { runConnectionReport } from "@scripts/commands/connection-report";
import { runEncryptCredentials } from "@scripts/commands/encrypt-credentials";
import { runManageFailedJobs } from "@scripts/commands/manage-failed-jobs";
import { runPurgeUser } from "@scripts/commands/purge-user";
import { runRecordAppleContractCommand } from "@scripts/commands/record-apple-contract";
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
      case cmd === "manage-failed-jobs":
        await runManageFailedJobs();
        break;
      case cmd === "purge-user":
        await runPurgeUser();
        break;
      case cmd === "backfill-billing":
        await runBackfillBilling();
        break;
      case cmd === "backfill-identities":
        await runBackfillIdentities();
        break;
      case cmd === "audit-connection-identity":
        await runAuditConnectionIdentity();
        break;
      case cmd === "encrypt-credentials":
        await runEncryptCredentials();
        break;
      case cmd === "connection-report":
        await runConnectionReport();
        break;
      case cmd === "apple-poll-throttle":
        await runApplePollThrottleCommand();
        break;
      case cmd === "record-apple-contract":
        await runRecordAppleContractCommand();
        break;
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
      .command("manage-failed-jobs")
      .helpOption(false)
      .allowUnknownOption(true)
      .description(
        "List/clear/requeue Sync jobs that exhausted the self-heal budget (list | clear | requeue)",
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
