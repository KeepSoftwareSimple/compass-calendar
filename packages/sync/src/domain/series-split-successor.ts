import { Logger } from "@core/logger/winston.logger";
import { type DateTime } from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import { remainderMasterId } from "@core/util/series-split";
import { splitInstantAfterTruncation } from "@sync/domain/occurrence-projection";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type EventRepository } from "@sync/storage/repositories/event.repository";

const MAX_SPLIT_CHAIN = 16;

const seriesSplitSuccessorLogger = Logger("sync:series-split-successor");

export const logOccurrencePastSplit = (
  command: Pick<CommandRecord, "_id" | "eventId">,
  masterId: string,
  recurrenceId: DateTime,
): void => {
  seriesSplitSuccessorLogger.warn(
    `Command ${command._id} (${command.eventId}): occurrencePastSplit at recurrenceId ${recurrenceId} (master ${masterId})`,
  );
};

const splitRecurrenceIdCandidates = (
  master: EventRecord,
  splitAfter: Date,
): DateTime[] => {
  const candidates = new Set<DateTime>();
  candidates.add(splitAfter.toISOString() as DateTime);
  if (master.schedule.kind === "timed") {
    candidates.add(
      dayjs(splitAfter).tz(master.schedule.timeZone).format() as DateTime,
    );
  }
  if (master.schedule.kind === "allDay") {
    candidates.add(
      `${dayjs(splitAfter).utc().format("YYYY-MM-DD")}T00:00:00.000Z` as DateTime,
    );
  }
  return [...candidates];
};

export type ResolveSeriesMasterForOccurrenceResult =
  | { ok: true; master: EventRecord }
  | { ok: false; master: EventRecord; reason: "occurrencePastSplit" };

// A scope-"this" command can still name a truncated series master after a
// thisAndFollowing split when the browser has not repointed the occurrence id
// yet. Walk the deterministic remainder chain until the target instant falls
// inside the master's bounded rules, or report that no successor exists.
export async function resolveSeriesMasterForOccurrence(
  events: EventRepository,
  command: Pick<CommandRecord, "tenantId" | "principalId" | "_id" | "eventId">,
  master: EventRecord,
  recurrenceId: DateTime,
): Promise<ResolveSeriesMasterForOccurrenceResult> {
  if (master.recurrence.kind !== "seriesMaster") {
    return { ok: true, master };
  }

  const targetMs = new Date(recurrenceId).getTime();
  let current = master;

  for (let depth = 0; depth < MAX_SPLIT_CHAIN; depth++) {
    if (current.recurrence.kind !== "seriesMaster") {
      return { ok: true, master: current };
    }
    const splitAfter = splitInstantAfterTruncation(current.recurrence.rules);
    if (splitAfter === null || targetMs < splitAfter.getTime()) {
      return { ok: true, master: current };
    }

    let successor: EventRecord | null = null;
    for (const splitAt of splitRecurrenceIdCandidates(current, splitAfter)) {
      const successorId = remainderMasterId(current._id, splitAt);
      successor = await events.findById(
        command.tenantId,
        command.principalId,
        successorId,
      );
      if (successor?.recurrence.kind === "seriesMaster") break;
      successor = null;
    }
    if (!successor) {
      logOccurrencePastSplit(command, current._id, recurrenceId);
      return { ok: false, master: current, reason: "occurrencePastSplit" };
    }
    current = successor;
  }

  logOccurrencePastSplit(command, current._id, recurrenceId);
  return { ok: false, master: current, reason: "occurrencePastSplit" };
}
