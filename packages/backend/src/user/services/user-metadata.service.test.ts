import { type UserMetadata } from "@core/types/user.types";
import * as supertokensRegistry from "@backend/auth/ports/supertokens.registry";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import userMetadataService from "./user-metadata.service";
import { afterEach, describe, expect, it, jest, mock, spyOn } from "bun:test";

describe("UserMetadataService.fetchUserMetadata", () => {
  afterEach(() => {
    jest.useRealTimers();
    mock.restore();
  });

  it("starts SuperTokens and Sync reads before either resolves", async () => {
    jest.useFakeTimers();

    let storeStarted = false;
    let syncStarted = false;

    spyOn(supertokensRegistry, "getUserMetadataStore").mockReturnValue({
      getUserMetadata: () =>
        new Promise((resolve) => {
          storeStarted = true;
          setTimeout(() => {
            resolve({
              status: "OK",
              metadata: { sync: { importGCal: "RESTART" } },
            });
          }, 1000);
        }),
      updateUserMetadata: async () => ({ status: "OK", metadata: {} }),
      reset: () => {},
    });

    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listConnections: () =>
        new Promise((resolve) => {
          syncStarted = true;
          setTimeout(() => {
            resolve({
              ok: true as const,
              value: { connections: [] },
              correlationId: "corr-parallel",
            });
          }, 1000);
        }),
    } as never);

    const pending = userMetadataService.fetchUserMetadata("user-1");
    let settled: UserMetadata | undefined;
    let failed: unknown;
    void pending.then(
      (value) => {
        settled = value;
      },
      (error: unknown) => {
        failed = error;
      },
    );

    await Promise.resolve();
    expect(storeStarted).toBe(true);
    expect(syncStarted).toBe(true);
    expect(settled).toBeUndefined();
    // Both 1s hops are scheduled together. A sequential await would have
    // queued only the SuperTokens timer at this point.
    expect(jest.getTimerCount()).toBe(2);

    jest.advanceTimersByTime(1000);
    await pending;

    expect(failed).toBeUndefined();
    expect(settled).toMatchObject({
      sync: { importGCal: "RESTART" },
      connections: [],
      google: { connectionState: "NOT_CONNECTED", connections: [] },
    });
  });
});
