import { type ConnectionId } from "@core/types/sync/identity.contracts";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import { resolveCommandAccessToken } from "@sync/domain/provider-command.internal";
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
