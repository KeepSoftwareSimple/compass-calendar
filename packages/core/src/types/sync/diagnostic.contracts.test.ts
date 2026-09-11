import { type DateTime } from "@core/types/domain-primitives";
import {
  type DiagnosticConnectionResponse,
  DiagnosticConnectionResponseSchema,
} from "@core/types/sync/diagnostic.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { describe, expect, it } from "bun:test";

const sample = (): DiagnosticConnectionResponse => ({
  diagnosticKey: "a".repeat(32),
  connectionId: "507f1f77bcf86cd799439011" as ConnectionId,
  tenantId: "507f1f77bcf86cd799439012" as TenantId,
  principalId: "507f1f77bcf86cd799439013" as PrincipalId,
  provider: "google",
  state: "delayed",
  stateReason: null,
  accountEmail: "user@example.com",
  lastSyncedAt: "2026-07-24T12:00:00.000Z" as DateTime,
  lastHealthyAt: "2026-07-24T11:00:00.000Z" as DateTime,
  disconnectedAt: null,
  calendarCount: 2,
  pendingJobCount: 1,
  failedJobCount: 0,
  exhaustedJobCount: 0,
  pendingCommandCount: 0,
});

describe("DiagnosticConnectionResponseSchema", () => {
  it("accepts a metadata-only support payload", () => {
    expect(DiagnosticConnectionResponseSchema.safeParse(sample()).success).toBe(
      true,
    );
  });

  it("rejects event content / credential fields", () => {
    expect(
      DiagnosticConnectionResponseSchema.safeParse({
        ...sample(),
        title: "Secret meeting",
      }).success,
    ).toBe(false);
    expect(
      DiagnosticConnectionResponseSchema.safeParse({
        ...sample(),
        refreshToken: "tok",
      }).success,
    ).toBe(false);
  });

  it("rejects a short diagnostic key", () => {
    expect(
      DiagnosticConnectionResponseSchema.safeParse({
        ...sample(),
        diagnosticKey: "abc",
      }).success,
    ).toBe(false);
  });
});
