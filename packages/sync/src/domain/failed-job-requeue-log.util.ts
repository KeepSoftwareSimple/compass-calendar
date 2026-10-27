import { type ExhaustedFailedJob } from "@sync/storage/repositories/job.repository";

/** In-process dedupe so steady-state exhausted jobs do not page every sweep. */
const loggedExhaustedJobIds = new Set<string>();

export type ExhaustedFailedJobLogLevel = "error" | "debug";

export function exhaustedFailedJobLogLevel(
  exhaustedJobs: readonly ExhaustedFailedJob[],
): ExhaustedFailedJobLogLevel {
  const hasNew = exhaustedJobs.some(
    (job) => !loggedExhaustedJobIds.has(job.id),
  );
  if (hasNew) {
    for (const job of exhaustedJobs) {
      loggedExhaustedJobIds.add(job.id);
    }
    return "error";
  }
  return "debug";
}

/** Test-only reset for sweep log dedupe state. */
export function resetExhaustedFailedJobLogDedupeForTests(): void {
  loggedExhaustedJobIds.clear();
}
