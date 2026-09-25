import { renderHook } from "@testing-library/react";
import { act } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUserMetadata from "@web/auth/compass/user/util/user-metadata.util";
import { type UseConnectGoogleResult } from "@web/auth/providers/connect.types";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";

const MIN_HIDDEN_DURATION_MS = 30_000;
const mockRefreshUserMetadata = mock().mockResolvedValue(undefined);

mockModuleForFile(
  "@web/auth/compass/user/util/user-metadata.util",
  realUserMetadata,
  { refreshUserMetadata: mockRefreshUserMetadata },
);

const { useSyncFocusRefresh } =
  require("./useSyncFocusRefresh") as typeof import("./useSyncFocusRefresh");

const fakeConnectGoogle = (
  overrides: Partial<UseConnectGoogleResult> = {},
): UseConnectGoogleResult => ({
  commandAction: null,
  connection: null,
  isAvailable: true,
  isConnecting: false,
  isRefreshing: false,
  state: "HEALTHY",
  connect: mock(),
  refresh: mock(),
  ...overrides,
});

describe("useSyncFocusRefresh", () => {
  let visibilityState = "visible";

  const setVisibility = (state: "visible" | "hidden") => {
    visibilityState = state;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => {
    mockRefreshUserMetadata.mockClear();
  });

  afterEach(() => {
    visibilityState = "visible";
    setSystemTime();
  });

  it("silently refreshes on mount for a healthy connection", () => {
    const refresh = mock();
    renderHook(() => useSyncFocusRefresh(() => fakeConnectGoogle({ refresh })));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ silent: true });
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
  });

  it("refreshes on mount for an ATTENTION connection", () => {
    const refresh = mock();
    renderHook(() =>
      useSyncFocusRefresh(() =>
        fakeConnectGoogle({ refresh, state: "ATTENTION" }),
      ),
    );

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
  });

  it.each(["NOT_CONNECTED", "RECONNECT_REQUIRED", "IMPORTING"] as const)(
    "does not provider-refresh on mount for %s",
    (state) => {
      const refresh = mock();
      renderHook(() =>
        useSyncFocusRefresh(() => fakeConnectGoogle({ refresh, state })),
      );

      expect(refresh).not.toHaveBeenCalled();
      expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
    },
  );

  it("does not provider-refresh when Google is unavailable", () => {
    const refresh = mock();
    renderHook(() =>
      useSyncFocusRefresh(() =>
        fakeConnectGoogle({ refresh, isAvailable: false }),
      ),
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
  });

  it("does not retrigger when shared refresh status changes", () => {
    const refresh = mock();
    let isRefreshing = false;
    const hook = renderHook(() =>
      useSyncFocusRefresh(() => fakeConnectGoogle({ refresh, isRefreshing })),
    );

    isRefreshing = true;
    hook.rerender();
    isRefreshing = false;
    hook.rerender();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not retrigger after the refresh changes connection state", () => {
    const refresh = mock();
    let state: UseConnectGoogleResult["state"] = "HEALTHY";
    const hook = renderHook(() =>
      useSyncFocusRefresh(() => fakeConnectGoogle({ refresh, state })),
    );

    state = "IMPORTING";
    hook.rerender();
    state = "HEALTHY";
    hook.rerender();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes again when the tab regains focus after being hidden long enough", () => {
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
    const refresh = mock();
    renderHook(() => useSyncFocusRefresh(() => fakeConnectGoogle({ refresh })));
    refresh.mockClear();
    mockRefreshUserMetadata.mockClear();

    act(() => {
      setVisibility("hidden");
      setSystemTime(new Date(Date.now() + MIN_HIDDEN_DURATION_MS + 1_000));
      setVisibility("visible");
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ silent: true });
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
  });

  it("refreshes metadata but not provider refresh on focus during IMPORTING", () => {
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
    const refresh = mock();
    renderHook(() =>
      useSyncFocusRefresh(() =>
        fakeConnectGoogle({ refresh, state: "IMPORTING" }),
      ),
    );
    refresh.mockClear();
    mockRefreshUserMetadata.mockClear();

    act(() => {
      setVisibility("hidden");
      setSystemTime(new Date(Date.now() + MIN_HIDDEN_DURATION_MS + 1_000));
      setVisibility("visible");
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
  });

  it("does not refresh on a short hide", () => {
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
    const refresh = mock();
    renderHook(() => useSyncFocusRefresh(() => fakeConnectGoogle({ refresh })));
    refresh.mockClear();
    mockRefreshUserMetadata.mockClear();

    act(() => {
      setVisibility("hidden");
      setSystemTime(new Date(Date.now() + MIN_HIDDEN_DURATION_MS - 1_000));
      setVisibility("visible");
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(mockRefreshUserMetadata).not.toHaveBeenCalled();
  });
});
