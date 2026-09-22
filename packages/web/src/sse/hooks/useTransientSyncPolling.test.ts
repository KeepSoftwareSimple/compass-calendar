import { renderHook } from "@testing-library/react";
import { act } from "react";
import * as userMetadataUtil from "@web/auth/compass/user/util/user-metadata.util";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { useTransientSyncPolling } from "./useTransientSyncPolling";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const TRANSIENT_POLL_MS = 20_000;

describe("useTransientSyncPolling", () => {
  let intervalCallback: (() => void) | undefined;
  let setIntervalSpy: ReturnType<typeof spyOn>;
  let clearIntervalSpy: ReturnType<typeof spyOn>;
  let refreshSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    intervalCallback = undefined;
    refreshSpy = spyOn(
      userMetadataUtil,
      "refreshUserMetadata",
    ).mockResolvedValue(undefined);
    setIntervalSpy = spyOn(globalThis, "setInterval").mockImplementation(((
      callback: TimerHandler,
    ) => {
      if (typeof callback === "function") {
        intervalCallback = () => callback();
      }
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval);
    clearIntervalSpy = spyOn(globalThis, "clearInterval").mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    refreshSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    act(() => {
      userMetadataActions.clear();
    });
  });

  it("polls metadata while a connection is importing and stops when it settles", () => {
    userMetadataActions.set({
      connections: [
        {
          id: "c1",
          state: "importing",
          stateReason: null,
          lastSyncedAt: null,
          lastHealthyAt: null,
          accountEmail: "a@example.com",
          connectionState: "IMPORTING",
          canSuggestContacts: false,
        },
      ],
    });

    const hook = renderHook(() => useTransientSyncPolling());

    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      TRANSIENT_POLL_MS,
    );

    act(() => {
      intervalCallback?.();
    });
    expect(refreshSpy).toHaveBeenCalledWith({ force: true });

    act(() => {
      userMetadataActions.set({
        connections: [
          {
            id: "c1",
            state: "healthy",
            stateReason: null,
            lastSyncedAt: null,
            lastHealthyAt: null,
            accountEmail: "a@example.com",
            connectionState: "HEALTHY",
            canSuggestContacts: false,
          },
        ],
      });
    });
    hook.rerender();

    expect(clearIntervalSpy).toHaveBeenCalled();
    hook.unmount();
  });

  it("does not poll when no connection is transient", () => {
    userMetadataActions.set({
      connections: [
        {
          id: "c1",
          state: "healthy",
          stateReason: null,
          lastSyncedAt: null,
          lastHealthyAt: null,
          accountEmail: "a@example.com",
          connectionState: "HEALTHY",
          canSuggestContacts: false,
        },
      ],
    });

    const { unmount } = renderHook(() => useTransientSyncPolling());

    expect(setIntervalSpy).not.toHaveBeenCalled();
    unmount();
  });
});
