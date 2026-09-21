import { session } from "@web/auth/compass/session/Session";
import * as posthogBootstrap from "@web/auth/posthog/posthog.bootstrap";
import * as sessionExpiredToast from "@web/common/utils/toast/session-expired.toast";
import {
  closeStream,
  getSseDegradedSinceMs,
  isSseDegraded,
  openStream,
  subscribeSseDegraded,
} from "./sse.client";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const capture = mock();
const getPosthogClient = spyOn(
  posthogBootstrap,
  "getPosthogClient",
).mockReturnValue({ capture } as never);

afterAll(() => {
  getPosthogClient.mockRestore();
});

// Minimal EventSource fake: no network, just enough surface for sse.client's
// addEventListener/removeEventListener/close and readyState check.
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  #listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("sse.client degraded state", () => {
  const originalEventSource = globalThis.EventSource;
  const originalSetTimeout = globalThis.setTimeout;
  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  let fakeEs: FakeEventSource;
  let eventSourceMock: ReturnType<typeof mock>;
  let timerCallbacks: Array<{ callback: () => void; delayMs: number }>;
  let setTimeoutSpy: ReturnType<typeof mock>;
  let nowMs: number;
  let openAuthModal: ReturnType<typeof spyOn>;

  afterAll(() => {
    globalThis.EventSource = originalEventSource;
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
    Math.random = originalRandom;
  });

  beforeEach(() => {
    capture.mockClear();
    getPosthogClient.mockReturnValue({ capture } as never);
    fakeEs = new FakeEventSource();
    eventSourceMock = mock(() => {
      fakeEs = new FakeEventSource();
      return fakeEs;
    });
    // @ts-expect-error test double, not a full EventSource
    globalThis.EventSource = Object.assign(eventSourceMock, {
      CONNECTING: FakeEventSource.CONNECTING,
      OPEN: FakeEventSource.OPEN,
      CLOSED: FakeEventSource.CLOSED,
    });
    Math.random = () => 0.5;
    openAuthModal = spyOn(
      sessionExpiredToast,
      "openAuthModalFromOutsideRouter",
    ).mockResolvedValue(undefined);
    spyOn(session, "doesSessionExist").mockResolvedValue(true);

    timerCallbacks = [];
    setTimeoutSpy = mock((callback: () => void, delayMs: number) => {
      timerCallbacks.push({ callback, delayMs });
      return timerCallbacks.length;
    });
    // @ts-expect-error partial override, only setTimeout is invoked by name here
    globalThis.setTimeout = setTimeoutSpy;

    nowMs = 1_000_000;
    Date.now = () => nowMs;
    window.history.replaceState(null, "", "/");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    closeStream();
    Date.now = originalDateNow;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.history.replaceState(null, "", "/");
  });

  const runDegradedTimer = () => {
    const due = timerCallbacks.find((t) => t.delayMs === 15_000);
    due?.callback();
  };

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  const reconnectTimers = () =>
    timerCallbacks.filter((t) => t.delayMs !== 15_000);

  const runLatestReconnectTimer = async () => {
    await flush();
    const due = reconnectTimers().at(-1);
    due?.callback();
  };

  const openThenError = async (readyState = FakeEventSource.CONNECTING) => {
    openStream();
    fakeEs.readyState = FakeEventSource.OPEN;
    fakeEs.dispatch("open");
    fakeEs.readyState = readyState;
    fakeEs.dispatch("error");
    await flush();
  };

  it("starts not degraded", () => {
    expect(isSseDegraded()).toBe(false);
  });

  it("flips degraded once the stream has been down past the 15s window", async () => {
    openStream();
    fakeEs.dispatch("error");
    await flush();

    expect(isSseDegraded()).toBe(false);

    runDegradedTimer();

    expect(isSseDegraded()).toBe(true);
  });

  it("does not report degraded if the stream reopens before the window elapses", async () => {
    openStream();
    fakeEs.dispatch("error");
    await runLatestReconnectTimer();
    fakeEs.readyState = FakeEventSource.OPEN;
    fakeEs.dispatch("open");

    runDegradedTimer();

    expect(isSseDegraded()).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it("notifies subscribers when degraded flips", async () => {
    const onChange = mock();
    const unsubscribe = subscribeSseDegraded(onChange);

    openStream();
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();

    expect(onChange).toHaveBeenCalled();
    unsubscribe();
  });

  it("clears degraded on reconnect (open event)", async () => {
    openStream();
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();
    expect(isSseDegraded()).toBe(true);

    await runLatestReconnectTimer();
    fakeEs.readyState = FakeEventSource.OPEN;
    fakeEs.dispatch("open");

    expect(isSseDegraded()).toBe(false);
  });

  it("clears degraded when the stream is intentionally closed", async () => {
    openStream();
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();
    expect(isSseDegraded()).toBe(true);

    closeStream();

    expect(isSseDegraded()).toBe(false);
  });

  it("records when degradation began and keeps the first timestamp", async () => {
    expect(getSseDegradedSinceMs()).toBeNull();

    openStream();
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();
    expect(getSseDegradedSinceMs()).toBe(nowMs);

    const firstDegradedAt = nowMs;
    nowMs += 20_000;
    await runLatestReconnectTimer();
    fakeEs.dispatch("error");
    await flush();
    for (const timer of timerCallbacks.filter((t) => t.delayMs === 15_000)) {
      timer.callback();
    }
    expect(getSseDegradedSinceMs()).toBe(firstDegradedAt);
  });

  it("clears the degraded timestamp on reopen and on close", async () => {
    openStream();
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();
    await runLatestReconnectTimer();
    fakeEs.readyState = FakeEventSource.OPEN;
    fakeEs.dispatch("open");
    expect(getSseDegradedSinceMs()).toBeNull();

    fakeEs.readyState = FakeEventSource.CONNECTING;
    fakeEs.dispatch("error");
    await flush();
    for (const timer of timerCallbacks.filter((t) => t.delayMs === 15_000)) {
      timer.callback();
    }
    expect(getSseDegradedSinceMs()).toBe(nowMs);

    closeStream();
    expect(getSseDegradedSinceMs()).toBeNull();
  });

  it("captures diagnostic properties on the first degraded report", async () => {
    window.history.replaceState(null, "", "/week");
    openStream();
    fakeEs.readyState = FakeEventSource.OPEN;
    fakeEs.dispatch("open");
    fakeEs.dispatch("message", {
      data: JSON.stringify({
        type: "eventsChanged",
        calendarId: "507f1f77bcf86cd799439011",
        eventIds: ["507f1f77bcf86cd799439012"],
        reason: "updated",
      }),
    });
    fakeEs.dispatch("message", {
      data: JSON.stringify({
        type: "calendarsChanged",
        calendarIds: ["507f1f77bcf86cd799439011"],
      }),
    });
    nowMs += 4_000;
    fakeEs.readyState = FakeEventSource.CONNECTING;
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("sse_connection_degraded", {
      reconnect_count: 1,
      error_type: "timeout",
      connection_duration_ms: 4_000,
      retry_attempt: 0,
      user_event_count: 2,
      page_path: "/week",
    });
  });

  it("records connection_duration_ms from last open to the first error", async () => {
    openStream();
    fakeEs.readyState = FakeEventSource.OPEN;
    fakeEs.dispatch("open");
    nowMs += 12_500;
    fakeEs.readyState = FakeEventSource.CONNECTING;
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();

    expect(capture).toHaveBeenCalledWith(
      "sse_connection_degraded",
      expect.objectContaining({ connection_duration_ms: 12_500 }),
    );
  });

  it("counts retry_attempt from zero for the first failure in an episode", async () => {
    await openThenError();
    await runLatestReconnectTimer();
    fakeEs.dispatch("error");
    await runLatestReconnectTimer();
    fakeEs.dispatch("error");
    await flush();
    runDegradedTimer();

    expect(capture).toHaveBeenCalledWith(
      "sse_connection_degraded",
      expect.objectContaining({
        retry_attempt: 2,
        reconnect_count: 3,
      }),
    );
  });

  it("classifies a closed EventSource as server_closed", async () => {
    await openThenError(FakeEventSource.CLOSED);
    runDegradedTimer();

    expect(capture).toHaveBeenCalledWith(
      "sse_connection_degraded",
      expect.objectContaining({ error_type: "server_closed" }),
    );
  });

  it("classifies an offline browser as network_error", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await openThenError();
    runDegradedTimer();

    expect(capture).toHaveBeenCalledWith(
      "sse_connection_degraded",
      expect.objectContaining({ error_type: "network_error" }),
    );
  });

  it("does not let a PostHog failure interrupt degraded-state reporting", async () => {
    capture.mockImplementationOnce(() => {
      throw new Error("capture unavailable");
    });
    await openThenError();

    expect(() => runDegradedTimer()).not.toThrow();
    expect(isSseDegraded()).toBe(true);
  });

  it("backs off reconnect delays then stops after ten consecutive failures", async () => {
    openStream();
    expect(eventSourceMock).toHaveBeenCalledTimes(1);
    const expected = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];

    for (let i = 0; i < 12; i += 1) {
      fakeEs.dispatch("error");
      await flush();
      if (i < 9) {
        if (i < expected.length) {
          expect(reconnectTimers().at(-1)?.delayMs).toBe(expected[i]);
        }
        await runLatestReconnectTimer();
      }
    }

    expect(eventSourceMock).toHaveBeenCalledTimes(10);
    expect(capture).toHaveBeenCalledWith(
      "sse_connection_degraded",
      expect.objectContaining({ stopped_reason: "max_attempts" }),
    );
  });

  it("stops reconnecting after one error when the session probe returns 401", async () => {
    spyOn(session, "doesSessionExist").mockRejectedValue({ status: 401 });
    openStream();
    fakeEs.dispatch("error");
    await flush();

    expect(eventSourceMock).toHaveBeenCalledTimes(1);
    expect(reconnectTimers()).toHaveLength(0);
    expect(openAuthModal).toHaveBeenCalledWith("login");
    expect(capture).toHaveBeenCalledWith(
      "sse_connection_degraded",
      expect.objectContaining({ stopped_reason: "auth" }),
    );
  });

  it("resets the backoff counter when the stream opens", async () => {
    openStream();
    fakeEs.dispatch("error");
    await runLatestReconnectTimer();
    fakeEs.readyState = FakeEventSource.OPEN;
    fakeEs.dispatch("open");
    fakeEs.dispatch("error");
    await flush();

    expect(reconnectTimers().at(-1)?.delayMs).toBe(1_000);
  });
});
