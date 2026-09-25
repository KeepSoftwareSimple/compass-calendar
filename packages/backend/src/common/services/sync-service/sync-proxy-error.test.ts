import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { AuthError } from "@backend/common/errors/auth/auth.errors";
import { error } from "@backend/common/errors/handlers/error.handler";
import {
  isSyncProxyFailure,
  logLevelForSyncClientError,
  throwSyncCommandSubmitFailure,
  throwSyncProxyFailure,
} from "@backend/common/services/sync-service/sync-proxy-error";
import { type SyncClientErrorKind } from "@backend/common/services/sync-service/sync-service.client";
import {
  EventMutationException,
  toEventMutationError,
} from "@backend/event/event.error";
import { describe, expect, it } from "bun:test";

describe("toEventMutationError", () => {
  it("keeps PROVIDER_FAILURE retryable for typed mutation failures", () => {
    const mapped = toEventMutationError(
      new EventMutationException("PROVIDER_FAILURE", "provider blip"),
    );
    expect(mapped.status).toBe(502);
    expect(mapped.body.retryable).toBe(true);
  });

  it("maps unknown errors to non-retryable 500", () => {
    const mapped = toEventMutationError(new Error("boom"));
    expect(mapped.status).toBe(Status.INTERNAL_SERVER);
    expect(mapped.body).toEqual({
      code: "PROVIDER_FAILURE",
      message: "boom",
      retryable: false,
    });
  });
});

describe("sync-proxy-error", () => {
  it("maps unavailable Sync reads to 503, never 600", () => {
    try {
      throwSyncProxyFailure("unavailable", "calendars down");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BaseError);
      expect((e as BaseError).statusCode).toBe(Status.SERVICE_UNAVAILABLE);
      expect((e as BaseError).statusCode).not.toBe(Status.UNSURE);
    }
  });

  // The invalidResponse detail must reach the thrown message, so the
  // error-tracking issue names which field broke the contract.
  it("appends the invalidResponse detail to the thrown message", () => {
    try {
      throwSyncProxyFailure(
        "invalidResponse",
        "Failed to list calendars from sync (invalidResponse)",
        "issues=<root>: unrecognized_keys [addedByNewerSync]",
      );
      throw new Error("expected throw");
    } catch (e) {
      expect((e as BaseError).result).toContain("addedByNewerSync");
    }
  });

  it("maps unexpected Sync reads to 502, never 600", () => {
    try {
      throwSyncProxyFailure("unexpectedStatus", "weird status");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BaseError);
      expect((e as BaseError).statusCode).toBe(Status.BAD_GATEWAY);
      expect((e as BaseError).statusCode).not.toBe(Status.UNSURE);
    }
  });

  // Backpressure from Sync is not a provider verdict. It used to surface as a
  // 502 on mutations while the read path already used 503, which made a Sync
  // throttle indistinguishable from a bad gateway in the logs (2026-08-23).
  it.each(["timeout", "unavailable"] as const)(
    "maps command submit %s to retryable SYNC_UNAVAILABLE 503",
    (kind) => {
      try {
        throwSyncCommandSubmitFailure(kind);
        throw new Error("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(EventMutationException);
        expect((e as EventMutationException).mutationCode).toBe(
          "SYNC_UNAVAILABLE",
        );
        const mapped = toEventMutationError(e);
        expect(mapped.status).toBe(Status.SERVICE_UNAVAILABLE);
        expect(mapped.body.retryable).toBe(true);
      }
    },
  );

  it("still maps an unexpected command submit failure to PROVIDER_FAILURE 502", () => {
    try {
      throwSyncCommandSubmitFailure("unexpectedStatus");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EventMutationException);
      expect((e as EventMutationException).mutationCode).toBe(
        "PROVIDER_FAILURE",
      );
      const mapped = toEventMutationError(e);
      expect(mapped.status).toBe(502);
      expect(mapped.body.retryable).toBe(true);
    }
  });
});

describe("logLevelForSyncClientError", () => {
  // Only our own backpressure / a Sync restart stays quiet.
  it.each(["timeout", "unavailable"] as const)(
    "keeps %s at warn so a Sync restart files no exception",
    (kind) => {
      expect(logLevelForSyncClientError(kind)).toBe("warn");
    },
  );

  // These are defects, and PostHogExceptionTransport only listens at `error`:
  // logging them at `warn` is what let the >20-calendar badRequest outage run
  // for a day with no error-tracking issue (2026-08-25).
  it.each([
    "badRequest",
    "unauthorized",
    "notFound",
    "conflict",
    "invalidResponse",
    "unexpectedStatus",
  ] as const)(
    "reports %s at error so it is captured as an exception",
    (kind) => {
      expect(logLevelForSyncClientError(kind)).toBe("error");
    },
  );

  // Pins the two to one rule: a new kind must not be quiet on the log side
  // while the status side treats it as a 502 defect.
  it("stays consistent with the status mapping for every kind", () => {
    const kinds: SyncClientErrorKind[] = [
      "timeout",
      "unavailable",
      "badRequest",
      "unauthorized",
      "notFound",
      "conflict",
      "invalidResponse",
      "unexpectedStatus",
    ];

    for (const kind of kinds) {
      let status: number | undefined;
      try {
        throwSyncProxyFailure(kind, "msg");
      } catch (e) {
        status = (e as BaseError).statusCode;
      }
      const expected = status === Status.SERVICE_UNAVAILABLE ? "warn" : "error";
      expect(logLevelForSyncClientError(kind)).toBe(expected);
    }
  });
});

describe("isSyncProxyFailure", () => {
  it.each([
    "timeout",
    "unavailable",
    "invalidResponse",
    "unexpectedStatus",
  ] as const)("recognizes the %s failure", (kind) => {
    let thrown: unknown;
    try {
      throwSyncProxyFailure(kind, "msg");
    } catch (e) {
      thrown = e;
    }
    expect(isSyncProxyFailure(thrown)).toBe(true);
  });

  it("ignores other 503s and non-BaseErrors", () => {
    expect(
      isSyncProxyFailure(error(AuthError.GoogleNotConfigured, "not set")),
    ).toBe(false);
    expect(
      isSyncProxyFailure(
        new EventMutationException("SYNC_UNAVAILABLE", "sync down"),
      ),
    ).toBe(false);
    expect(isSyncProxyFailure(new Error("boom"))).toBe(false);
  });
});
