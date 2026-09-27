import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import * as realEnvConstants from "@web/common/constants/env.constants";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";

let mockIsDev = false;
const fetchMock = mock();
const envConstantsSnapshot = { ...realEnvConstants };

const MIN_HIDDEN_DURATION_MS = 30_000;
const BACKUP_CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function renderVersionCheckHook() {
  // Snapshot first: mock.module rebinds the live import, so spreading
  // realEnvConstants inside the factory would copy the mock into itself and
  // drop ENV_WEB for every later file in the shard.
  mock.module("@web/common/constants/env.constants", () => ({
    ...envConstantsSnapshot,
    IS_DEV: mockIsDev,
  }));
  const moduleUrl = new URL(
    `./useVersionCheck.ts?test=${Math.random().toString(36).slice(2)}`,
    import.meta.url,
  );
  const { useVersionCheck } = await import(moduleUrl.href);

  return renderHook(() => useVersionCheck());
}

describe("useVersionCheck", () => {
  let visibilityState = "visible";
  let intervalCallback: (() => void) | undefined;
  let setIntervalSpy: ReturnType<typeof spyOn>;
  let fetchSpy: ReturnType<typeof spyOn>;

  /** Lets checkVersion's fetch → json → setState chain finish inside act (microtasks). */
  const flushVersionCheckAsync = async () => {
    await act(async () => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    });
  };

  beforeEach(() => {
    mockIsDev = false;
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
    intervalCallback = undefined;
    setIntervalSpy = spyOn(window, "setInterval").mockImplementation(((
      callback: TimerHandler,
    ) => {
      if (typeof callback === "function") {
        intervalCallback = () => callback();
      }

      return 1;
    }) as typeof window.setInterval);

    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ version: "dev" }),
    });
    // spyOn so afterEach can restore MSW's fetch patch. Assigning
    // global.fetch and putting back a copy taken at module load (before
    // server.listen) leaves BaseApi talking to native fetch, so later
    // mutation tests never hit their PUT/POST handlers.
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      fetchMock as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    setSystemTime();
    setIntervalSpy.mockRestore();
  });

  afterAll(() => {
    mock.module(
      "@web/common/constants/env.constants",
      () => envConstantsSnapshot,
    );
  });

  it("checks version on initial mount", async () => {
    await renderVersionCheckHook();
    await flushVersionCheckAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      BACKUP_CHECK_INTERVAL_MS,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost\/version\.json\?t=\d+$/),
      expect.objectContaining({
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      }),
    );
  });

  it("does not check for updates in development mode", async () => {
    mockIsDev = true;
    const addEventListenerSpy = spyOn(document, "addEventListener");

    await renderVersionCheckHook();
    await flushVersionCheckAsync();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    act(() => {
      intervalCallback?.();
    });

    expect(fetchMock).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
  });

  it("sets isUpdateAvailable when server version differs", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    });

    const { result } = await renderVersionCheckHook();

    await flushVersionCheckAsync();

    await waitFor(() => {
      expect(result.current.isUpdateAvailable).toBe(true);
    });
  });

  it("keeps isUpdateAvailable false when versions match", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ version: "dev" }),
    });

    const { result } = await renderVersionCheckHook();

    await flushVersionCheckAsync();

    expect(result.current.isUpdateAvailable).toBe(false);
  });

  it("handles network failures without crashing", async () => {
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => undefined,
    );

    fetchMock.mockRejectedValue(new Error("Network down"));

    const { result } = await renderVersionCheckHook();

    await flushVersionCheckAsync();

    expect(result.current.isUpdateAvailable).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Version check failed:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("ignores invalid version payloads", async () => {
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => undefined,
    );

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ version: 123 }),
    });

    const { result } = await renderVersionCheckHook();

    await flushVersionCheckAsync();

    expect(result.current.isUpdateAvailable).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("checks when tab becomes visible after being hidden long enough", async () => {
    await renderVersionCheckHook();
    await flushVersionCheckAsync();

    fetchMock.mockClear();

    act(() => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      setSystemTime(new Date(Date.now() + MIN_HIDDEN_DURATION_MS + 1_000));
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not check when tab becomes visible after a short hide", async () => {
    await renderVersionCheckHook();
    await flushVersionCheckAsync();

    fetchMock.mockClear();

    act(() => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      setSystemTime(new Date(Date.now() + MIN_HIDDEN_DURATION_MS - 10_000));
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cleans up the visibility listener on unmount", async () => {
    const addEventListenerSpy = spyOn(document, "addEventListener");
    const removeEventListenerSpy = spyOn(document, "removeEventListener");

    const { unmount } = await renderVersionCheckHook();

    const handler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "visibilitychange",
    )?.[1];

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "visibilitychange",
      handler,
    );

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("runs the backup poll on the interval", async () => {
    await renderVersionCheckHook();
    await flushVersionCheckAsync();

    fetchMock.mockClear();

    act(() => {
      intervalCallback?.();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prevents concurrent checks", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    await renderVersionCheckHook();
    await flushVersionCheckAsync();

    fetchMock.mockReturnValue(fetchPromise);
    fetchMock.mockClear();

    act(() => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      setSystemTime(new Date(Date.now() + MIN_HIDDEN_DURATION_MS + 1_000));
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));

      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      setSystemTime(new Date(Date.now() + MIN_HIDDEN_DURATION_MS + 1_000));
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      resolveFetch?.({
        ok: true,
        json: async () => ({ version: "dev" }),
      });
    });
  });
});
