import { resolveSyncMongoUri } from "@scripts/common/sync-mongo-uri";
import { Logger } from "@core/logger/winston.logger";
import { SyncJobIdSchema } from "@core/types/sync/identity.contracts";
import { FAILED_JOB_MAX_REQUEUES } from "@sync/domain/failed-job-requeue.service";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { SyncMongoService } from "@sync/storage/sync-mongo.service";

const logger = Logger("scripts.commands.manage-failed-jobs");

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

/**
 * Operator tooling for Sync jobs that exhausted the self-heal requeue budget
 * and still occupy a coalescing key. Default actions are dry-run; `--apply`
 * persists.
 *
 *   bun run cli manage-failed-jobs list
 *   bun run cli manage-failed-jobs clear --id <id> --coalescing-key <key> [--apply]
 *   bun run cli manage-failed-jobs requeue --id <id> [--apply]
 */
export async function runManageFailedJobs(): Promise<void> {
  const args = process.argv.slice(3);
  const action = args[0];
  if (action !== "list" && action !== "clear" && action !== "requeue") {
    throw new Error(
      "Usage: manage-failed-jobs <list|clear|requeue> [--id …] [--coalescing-key …] [--apply]",
    );
  }

  const apply = args.includes("--apply");
  const syncMongo = new SyncMongoService();
  try {
    await syncMongo.connect({
      uri: resolveSyncMongoUri("manage-failed-jobs"),
      enforceLeastPrivilege: false,
      forbiddenDatabaseName: "prod_calendar",
    });
    const jobs = new JobRepository(syncMongo.db);

    if (action === "list") {
      const [count, sample] = await Promise.all([
        jobs.countExhaustedFailed(FAILED_JOB_MAX_REQUEUES),
        jobs.listExhaustedFailed(FAILED_JOB_MAX_REQUEUES),
      ]);
      const report = {
        maxRequeues: FAILED_JOB_MAX_REQUEUES,
        count,
        sampleSize: sample.length,
        truncated: count > sample.length,
        jobs: sample.map((job) => ({
          id: job.id,
          coalescingKey: job.coalescingKey,
          connectionId: job.connectionId,
          tenantId: job.tenantId,
          principalId: job.principalId,
          failureClass: job.failureClass,
          requeuedCount: job.requeuedCount,
          updatedAt: job.updatedAt.toISOString(),
        })),
      };
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      logger.info(
        `manage-failed-jobs list count=${report.count} sample=${report.sampleSize} truncated=${report.truncated}`,
      );
      await syncMongo.disconnect();
      process.exit(0);
    }

    const idRaw = flagValue(args, "--id");
    if (!idRaw) {
      throw new Error(`manage-failed-jobs ${action} requires --id <SyncJobId>`);
    }
    const id = SyncJobIdSchema.parse(idRaw);
    const existing = await jobs.findByIdUnscoped(id);
    if (!existing) {
      throw new Error(`No job found for id=${id}`);
    }
    if (existing.state !== "failed") {
      throw new Error(
        `Job id=${id} is state=${existing.state}; ${action} only accepts failed jobs`,
      );
    }

    if (action === "clear") {
      const coalescingKey =
        flagValue(args, "--coalescing-key") ?? existing.coalescingKey;
      if (coalescingKey !== existing.coalescingKey) {
        throw new Error(
          `coalescing-key mismatch for id=${id}: expected ${existing.coalescingKey}`,
        );
      }
      const report = {
        dryRun: !apply,
        action: "clear" as const,
        id,
        coalescingKey,
        state: existing.state,
      };
      if (apply) {
        const ok = await jobs.remove(id, coalescingKey);
        if (!ok) {
          throw new Error(`Failed to clear id=${id} key=${coalescingKey}`);
        }
      }
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      logger.info(
        `manage-failed-jobs clear dryRun=${report.dryRun} id=${id} key=${coalescingKey}`,
      );
      await syncMongo.disconnect();
      process.exit(0);
    }

    const report = {
      dryRun: !apply,
      action: "requeue" as const,
      id,
      coalescingKey: existing.coalescingKey,
      requeuedCount: existing.requeuedCount,
    };
    if (apply) {
      const ok = await jobs.requeue(id, new Date());
      if (!ok) {
        throw new Error(`Failed to requeue id=${id}`);
      }
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    logger.info(`manage-failed-jobs requeue dryRun=${report.dryRun} id=${id}`);
    await syncMongo.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(error);
    try {
      await syncMongo.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}
