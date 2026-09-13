import {
  type SyncCommandFailureReason,
  type SyncCommandOutcome,
} from "@core/types/sync/command.contracts";

export const commandSubmitOk = (outcome: SyncCommandOutcome) => ({
  ok: true as const,
  value: { command: { outcome } },
});

export const confirmedCommandSubmit = () =>
  commandSubmitOk({
    state: "confirmed",
    providerEventId: "prov-1",
    providerVersion: "v1",
  } as SyncCommandOutcome);

export const failedCommandSubmit = (failureReason: SyncCommandFailureReason) =>
  commandSubmitOk({ state: "failed", failureReason });
