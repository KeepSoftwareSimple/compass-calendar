import { faker } from "@faker-js/faker";
import { type CommandSubmitRequest } from "@core/types/sync/command.contracts";
import { submitCommandOrThrow } from "@backend/common/services/sync-service/submit-command-or-throw";
import { type SyncServiceClient } from "@backend/common/services/sync-service/sync-service.client";
import { EventMutationException } from "@backend/event/event.error";
import { describe, expect, it, mock } from "bun:test";

const request = {
  idempotencyKey: "create:aaaaaaaaaaaaaaaaaaaaaaaa",
  eventId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  expectedVersion: null,
  input: {
    kind: "delete",
    invitation: "all",
    scope: "all",
    recurrenceId: null,
  },
} as CommandSubmitRequest;

const submit = (value: unknown) =>
  submitCommandOrThrow(
    {
      submitCommand: mock(async () => value),
    } as unknown as SyncServiceClient,
    faker.database.mongodbObjectId(),
    request,
  );

describe("submitCommandOrThrow", () => {
  it("returns the command when the outcome is confirmed", async () => {
    const command = {
      outcome: {
        state: "confirmed" as const,
        providerEventId: "prov-1",
        providerVersion: "v1",
      },
    };
    await expect(
      submit({ ok: true as const, value: { command } }),
    ).resolves.toMatchObject(command);
  });

  it("maps failed outcomes to typed mutation errors", async () => {
    const cases = [
      ["readOnlyCalendar", "CALENDAR_READ_ONLY"],
      ["versionConflict", "RECURRENCE_CONFLICT"],
      ["authorizationRevoked", "CONNECTION_REVOKED"],
      ["unsupportedCapability", "UNSUPPORTED_OPERATION"],
      ["permanentProviderError", "PROVIDER_FAILURE"],
    ] as const;

    for (const [failureReason, mutationCode] of cases) {
      await expect(
        submit({
          ok: true as const,
          value: {
            command: {
              outcome: { state: "failed" as const, failureReason },
            },
          },
        }),
      ).rejects.toMatchObject({ mutationCode });
    }
  });

  it("rejects cancelled outcomes as PROVIDER_FAILURE", async () => {
    await expect(
      submit({
        ok: true as const,
        value: { command: { outcome: { state: "cancelled" as const } } },
      }),
    ).rejects.toMatchObject({
      mutationCode: "PROVIDER_FAILURE",
      message: "Sync command was cancelled",
    });
  });

  it("never treats pending, applying, or reconciling as success", async () => {
    for (const state of ["pending", "applying", "reconciling"] as const) {
      const error = await submit({
        ok: true as const,
        value: { command: { outcome: { state } } },
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(EventMutationException);
      expect(error).toMatchObject({
        mutationCode: "PROVIDER_FAILURE",
        message: `Sync command did not resolve (${state})`,
      });
    }
  });

  it("maps transport timeout to SYNC_UNAVAILABLE", async () => {
    await expect(
      submit({
        ok: false as const,
        error: { kind: "timeout", status: 504, correlationId: "corr-1" },
      }),
    ).rejects.toMatchObject({ mutationCode: "SYNC_UNAVAILABLE" });
  });
});
