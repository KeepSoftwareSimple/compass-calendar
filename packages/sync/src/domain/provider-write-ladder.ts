import { LoggerFactory } from "@core/logger/logger.factory";
import { type SyncCommandFailureReason } from "@core/types/sync/command.contracts";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import { ProviderWriteError } from "@sync/providers/provider-event-writer.port";

// Narrow custody slice so tests can pass a plain fake; CredentialCustody
// satisfies it structurally.
export interface AccessTokenSource {
  getValidAccessToken(connectionId: ConnectionId): Promise<string>;
  discardRevoked(connectionId: ConnectionId): Promise<void>;
  invalidateAccessToken(connectionId: ConnectionId): Promise<void>;
}

// Callers decide how to turn a stop into a command outcome. Most take the
// shared pending-or-fail shape (provider-command.internal's stopCommand);
// the rest undo local state first (revertAndFail) or pick their own reason.
export type ProviderWriteStop =
  | { kind: "pending" }
  | { kind: "failed"; reason: SyncCommandFailureReason };

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; stop: ProviderWriteStop };

export type ProviderWriteAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; stop: ProviderWriteStop };

// Transient refresh → pending; revoked/missing → authorizationRevoked.
export async function resolveAccessToken(
  custody: AccessTokenSource,
  connectionId: ConnectionId,
): Promise<AccessTokenResult> {
  try {
    const accessToken = await custody.getValidAccessToken(connectionId);
    return { ok: true, accessToken };
  } catch (error) {
    if (
      error instanceof ProviderAuthError &&
      error.reason === "refreshFailed"
    ) {
      return { ok: false, stop: { kind: "pending" } };
    }
    return {
      ok: false,
      stop: { kind: "failed", reason: "authorizationRevoked" },
    };
  }
}

// Transient ProviderWriteError → pending; other reasons → failed; else rethrow.
export async function runProviderWrite<T>(
  attempt: () => Promise<T>,
): Promise<ProviderWriteAttempt<T>> {
  try {
    return { ok: true, value: await attempt() };
  } catch (error) {
    if (error instanceof ProviderWriteError) {
      if (error.reason === "transient") {
        return { ok: false, stop: { kind: "pending" } };
      }
      const causeMessage =
        error.cause instanceof Error ? error.cause.message : undefined;
      LoggerFactory("sync:provider-write").warn(
        causeMessage ? `${error.message} ${causeMessage}` : error.message,
      );
      return { ok: false, stop: { kind: "failed", reason: error.reason } };
    }
    throw error;
  }
}
