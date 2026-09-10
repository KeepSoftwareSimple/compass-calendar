import {
  type LoggerInstance,
  registerLoggerFactory,
  resetLoggerFactory,
} from "@core/logger/logger.factory";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import {
  type AccessTokenSource,
  resolveAccessToken,
  runProviderWrite,
} from "@sync/domain/provider-write-ladder";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import { ProviderWriteError } from "@sync/providers/provider-event-writer.port";
import { afterEach, describe, expect, it, mock } from "bun:test";

const connectionId = "507f1f77bcf86cd799439011" as ConnectionId;

describe("resolveAccessToken", () => {
  it("returns the token on success", async () => {
    const custody: AccessTokenSource = {
      getValidAccessToken: async () => "tok",
      discardRevoked: async () => {},
      invalidateAccessToken: async () => {},
    };
    await expect(resolveAccessToken(custody, connectionId)).resolves.toEqual({
      ok: true,
      accessToken: "tok",
    });
  });

  it("maps refreshFailed to pending", async () => {
    const custody: AccessTokenSource = {
      getValidAccessToken: async () => {
        throw new ProviderAuthError("refreshFailed", "blip");
      },
      discardRevoked: async () => {},
      invalidateAccessToken: async () => {},
    };
    await expect(resolveAccessToken(custody, connectionId)).resolves.toEqual({
      ok: false,
      stop: { kind: "pending" },
    });
  });

  it("maps other auth failures to authorizationRevoked", async () => {
    const custody: AccessTokenSource = {
      getValidAccessToken: async () => {
        throw new ProviderAuthError("authorizationRevoked", "gone");
      },
      discardRevoked: async () => {},
      invalidateAccessToken: async () => {},
    };
    await expect(resolveAccessToken(custody, connectionId)).resolves.toEqual({
      ok: false,
      stop: { kind: "failed", reason: "authorizationRevoked" },
    });
  });
});

describe("runProviderWrite", () => {
  afterEach(() => {
    resetLoggerFactory();
  });

  it("returns the value on success", async () => {
    await expect(runProviderWrite(async () => 42)).resolves.toEqual({
      ok: true,
      value: 42,
    });
  });

  it("maps transient ProviderWriteError to pending", async () => {
    await expect(
      runProviderWrite(async () => {
        throw new ProviderWriteError("transient", "blip");
      }),
    ).resolves.toEqual({ ok: false, stop: { kind: "pending" } });
  });

  it("maps permanent ProviderWriteError to failed with that reason", async () => {
    await expect(
      runProviderWrite(async () => {
        throw new ProviderWriteError("permanentProviderError", "missing");
      }),
    ).resolves.toEqual({
      ok: false,
      stop: { kind: "failed", reason: "permanentProviderError" },
    });
  });

  it("rethrows unexpected errors", async () => {
    await expect(
      runProviderWrite(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("logs one warn containing the cause message when a write fails", async () => {
    const warn = mock(() => {});
    registerLoggerFactory(
      () =>
        ({
          warn,
          error: mock(),
          info: mock(),
          debug: mock(),
        }) as unknown as LoggerInstance,
    );

    await expect(
      runProviderWrite(async () => {
        throw new ProviderWriteError(
          "unsupportedCapability",
          "Google declined to change this event",
          { cause: new Error("google error 400 (HTTP 400, reason invalid)") },
        );
      }),
    ).resolves.toEqual({
      ok: false,
      stop: { kind: "failed", reason: "unsupportedCapability" },
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const [message] = (warn.mock.calls as unknown[][])[0] ?? [];
    expect(message).toContain("Google declined to change this event");
    expect(message).toContain("HTTP 400");
    expect(message).toContain("reason invalid");
  });
});
