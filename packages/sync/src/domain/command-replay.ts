import { type CloudCommandDeps } from "@sync/domain/cloud-command.service";
import {
  isFollowingSplitAtSeriesStart,
  truncateRulesBefore,
} from "@sync/domain/occurrence-projection";
import {
  exceptionInstant,
  isCancelledException,
} from "@sync/domain/series-exception";
import {
  type CommandRecord,
  type CommandSubmit,
} from "@sync/storage/contracts/command.contracts";

// Whether a terminal command's replay should be treated as a genuine no-op
// (the world already matches what it once confirmed) or as stale (this
// submission is really a fresh intent that happens to share an identity/
// content key with an earlier terminal command).
//
// The delete idempotency key is deliberately identity-only (eventId/scope/
// recurrenceId — see toDeleteSubmitRequest in event-command.translation.ts),
// so a delete, undo (recreate under the SAME event id — see the "A25" doc
// comment in useUndoRedo.ts), and delete-again collide on the exact same key.
// Without this check, submitCloudCommand's short-circuit at the top of the
// function returns the OLD confirmed command forever: 204 to the caller, no
// provider call, no local change, and no TTL on `commands` to ever clear it.
// A delete resubmit needs no explicit intent flag to get this treatment - a
// world-state check (does the event still look deleted?) is enough on its
// own, since a delete's only failure mode from checking too eagerly is
// re-deleting an already-deleted event, which is harmless.
//
// create and update are different: the create idempotency key
// (`create:${eventId}`) is stable for that event id's whole lifetime, and the
// update key hashes its full content (see toReplaceSubmitRequests), so ANY
// later resubmission of the same payload collides with the original - not
// only an undo/redo replay. A world-state guess gets this wrong in a way
// that's NOT harmless: packages/web/src/common/utils/sync/
// local-event-sync.util.ts's offline promotion retries a create under the
// record's own stable id whenever the client never observed the first
// attempt's success; if the user deletes that event before the retry fires,
// "existing === null ⇒ stale" would silently resurrect an event the user
// deliberately removed. Nothing in the command history can tell "the delete
// this replay's undo is reversing" apart from "an unrelated delete that
// happened since" - so create/update are guarded only when the client
// explicitly marks the submission `restore: true` (set by useUndoRedo's
// replays, never by offline promotion) rather than guessing from world state.
export async function terminalReplayIsStale(
  deps: Pick<CloudCommandDeps, "events">,
  command: CommandRecord,
  submit: Pick<CommandSubmit, "restore">,
): Promise<boolean> {
  // An explicit cancellation is not re-litigated by a resubmit.
  if (command.outcome.state === "cancelled") return false;

  if (command.input.kind === "update") return submit.restore === true;

  if (command.input.kind === "create") {
    if (submit.restore !== true) return false;
    const existing = await deps.events.findById(
      command.tenantId,
      command.principalId,
      command.eventId,
    );
    // Double-undo, or a retry after the restore already landed: the event is
    // already back, so re-executing would risk a duplicate provider insert.
    return existing?.lifecycleState !== "active";
  }

  if (command.input.kind !== "delete") return false;

  const existing = await deps.events.findById(
    command.tenantId,
    command.principalId,
    command.eventId,
  );

  // Absence (or a pending-deletion row) is the delete's own desired end
  // state — a genuine timeout-retry short-circuits exactly as before.
  if (existing?.lifecycleState !== "active") return false;

  if (command.input.scope === "all") return true;

  // "this" / "thisAndFollowing" only apply to a series master; the contract
  // guarantees recurrenceId is set for both. Anything else is unreachable
  // from the browser today — stay conservative (not stale) rather than guess.
  if (
    command.input.recurrenceId === null ||
    existing.recurrence.kind !== "seriesMaster"
  ) {
    return false;
  }
  const recurrenceId = command.input.recurrenceId;
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    existing._id,
  );

  if (command.input.scope === "this") {
    const exception = exceptions.find(
      (candidate) => exceptionInstant(candidate) === recurrenceId,
    );
    const holds = exception !== undefined && isCancelledException(exception);
    return !holds;
  }

  // thisAndFollowing: a split at or before the series' first occurrence
  // collapses to a full-series delete (see deleteCloudSeriesFollowing) — the
  // master still existing means that never happened.
  const splitAt = new Date(recurrenceId);
  if (isFollowingSplitAtSeriesStart(existing.schedule, splitAt)) return true;
  const alreadyTruncated =
    JSON.stringify(existing.recurrence.rules) ===
    JSON.stringify(truncateRulesBefore(existing.recurrence.rules, splitAt));
  const hasFollowingException = exceptions.some(
    (candidate) =>
      new Date(exceptionInstant(candidate)).getTime() >= splitAt.getTime(),
  );
  const holds = alreadyTruncated && !hasFollowingException;
  return !holds;
}
