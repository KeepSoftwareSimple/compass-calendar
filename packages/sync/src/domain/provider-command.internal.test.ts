import { type ConnectionId } from "@core/types/sync/identity.contracts";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import {
  resolveCommandAccessToken,
  stopCommand,
} from "@sync/domain/provider-command.internal";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { describe, expect, it, mock } from "bun:test";

const connectionId = "507f1f77bcf86cd799439011" as ConnectionId;
const command = {
  tenantId: "t1",
  principalId: "p1",
  _id: "cmd1",
  attemptCount: 1,
} as CommandRecord;

const failedCommand = { ...command, _id: "failed" } as CommandRecord;

function depsWith(
  getValidAccessToken: () => Promise<string>,
  updateOutcome = mock(async () => failedCommand),
): ProviderMutationDeps {
  return {
    custody: {
      getValidAccessToken,
      discardRevoked: async () => {},
      invalidateAccessToken: async () => {},
    },
    commands: { updateOutcome },
  } as unknown as ProviderMutationDeps;
}

describe("stopCommand", () => {
  it("leaves the command pending on a transient stop", async () => {
    const updateOutcome = mock(async () => failedCommand);
    await expect(
      stopCommand(
        depsWith(async () => "tok", updateOutcome),
        command,
        { kind: "pending" },
        connectionId,
      ),
    ).resolves.toBe(command);
    expect(updateOutcome).not.toHaveBeenCalled();
  });

  it("fails the command with the stop's reason", async () => {
    const updateOutcome = mock(async () => failedCommand);
    await expect(
      stopCommand(
        depsWith(async () => "tok", updateOutcome),
        command,
        { kind: "failed", reason: "permanentProviderError" },
        connectionId,
      ),
    ).resolves.toBe(failedCommand);
    expect(updateOutcome).toHaveBeenCalledWith(
      command.tenantId,
      command.principalId,
      command._id,
      { state: "failed", failureReason: "permanentProviderError" },
      command.attemptCount,
    );
  });

  it("discards a revoked credential when that is the stop's reason", async () => {
    const discardRevoked = mock(async () => {});
    const deps = depsWith(async () => "tok");
    deps.custody.discardRevoked = discardRevoked;
    await stopCommand(
      deps,
      command,
      { kind: "failed", reason: "authorizationRevoked" },
      connectionId,
    );
    expect(discardRevoked).toHaveBeenCalledWith(connectionId);
  });
});

describe("resolveCommandAccessToken", () => {
  it("returns the token when custody succeeds", async () => {
    await expect(
      resolveCommandAccessToken(
        depsWith(async () => "tok"),
        command,
        connectionId,
      ),
    ).resolves.toEqual({ ok: true, accessToken: "tok" });
  });

  it("returns the original command when refresh is transient", async () => {
    await expect(
      resolveCommandAccessToken(
        depsWith(async () => {
          throw new ProviderAuthError("refreshFailed", "blip");
        }),
        command,
        connectionId,
      ),
    ).resolves.toEqual({ ok: false, command });
  });

  it("fails the command when the credential is revoked", async () => {
    const updateOutcome = mock(async () => failedCommand);
    await expect(
      resolveCommandAccessToken(
        depsWith(async () => {
          throw new ProviderAuthError("authorizationRevoked", "gone");
        }, updateOutcome),
        command,
        connectionId,
      ),
    ).resolves.toEqual({ ok: false, command: failedCommand });
    expect(updateOutcome).toHaveBeenCalled();
  });
});
