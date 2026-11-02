import { backfillMeetingTypes } from "@scripts/commands/backfill-meeting-types/backfill";
import { Logger } from "@core/logger/winston.logger";
import mongoService from "@backend/common/services/mongo.service";

const logger = Logger("scripts.commands.backfill-meeting-types");

function parseArgs(argv: string[]): { dryRun: boolean; batchSize: number } {
  const batchFlag = argv.indexOf("--batch-size");
  const batchSize = batchFlag >= 0 ? Number(argv[batchFlag + 1]) : 500;
  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new Error(
      "backfill-meeting-types --batch-size must be a positive number",
    );
  }
  return { dryRun: !argv.includes("--apply"), batchSize };
}

/**
 * Stores one default meeting type on booking pages saved before meeting
 * types existed. Reads already derive it, so this only makes Mongo explicit.
 * Dry-run by default; pass `--apply` to write. Run on staging first.
 *
 * Usage:
 *   bun run cli backfill-meeting-types [--apply] [--batch-size 500]
 */
export async function runBackfillMeetingTypes(): Promise<void> {
  try {
    const { dryRun, batchSize } = parseArgs(process.argv.slice(3));
    await mongoService.start();
    logger.info(
      `backfill-meeting-types dryRun=${dryRun} batchSize=${batchSize}`,
    );

    const report = await backfillMeetingTypes(mongoService.bookingPage, {
      dryRun,
      batchSize,
    });

    process.stdout.write(
      `${JSON.stringify({ ...report, changes: report.changes.length }, null, 2)}\n`,
    );
    logger.info(
      `backfill-meeting-types dryRun=${report.dryRun} matched=${report.matched} modified=${report.modified} skipped=${report.skipped.length}`,
    );

    await mongoService.stop();
    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
}
