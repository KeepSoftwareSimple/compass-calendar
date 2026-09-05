import { ObjectId } from "bson";
import { Status } from "@core/errors/status.codes";
import { createMockStandaloneEvent } from "@core/util/test/ccal.event.factory";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { type ApiError, type ApiResponse } from "@web/api/api.types";
import * as realPosthogBootstrap from "@web/auth/posthog/posthog.bootstrap";
import {
  EVENT_SAVE_UNAVAILABLE_TOAST_ID,
  GENERIC_ERROR_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  addId,
  focusCalendarEventElement,
  focusCalendarEventElementAfterDiscard,
  isEventInRange,
  refocusEventElement,
} from "@web/common/utils/event/event.util";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { WEEK_INTERACTION_EVENT_ID_ATTRIBUTE } from "@web/views/Week/interaction/registry/week-event.registry";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const mockCaptureException = mock();

// `capture` is a no-op here (not a mock) so a `track()` call elsewhere in the
// same test run - the module registration is process-global - doesn't crash
// on a stubbed client shaped only for captureException.
mockModuleForFile("@web/auth/posthog/posthog.bootstrap", realPosthogBootstrap, {
  getPosthogClient: () => ({
    captureException: mockCaptureException,
    capture: () => undefined,
    reset: () => undefined,
  }),
});

const { handleError } = await import("@web/common/utils/event/event.util");

function createServerError(status = Status.INTERNAL_SERVER): ApiError {
  const error = new Error(`Request failed with status ${status}`) as ApiError;
  error.name = "ApiError";
  error.response = { status } as ApiResponse<unknown>;
  return error;
}

describe("handleError", () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    mocks.error.mockClear();
    mockCaptureException.mockClear();
    mocks.isActive.mockReturnValue(false);
    registerToastPort(port);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("shows a distinct toast on a backend-unavailable error instead of silently reverting", () => {
    // No `response` at all: the browser never got an HTTP response back
    // (offline, DNS, dropped connection) - previously this returned early
    // with zero feedback and the optimistic edit just snapped back.
    const error = new Error("Request failed");
    error.name = "ApiError";

    handleError(error);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0]?.[1]).toMatchObject({
      toastId: EVENT_SAVE_UNAVAILABLE_TOAST_ID,
    });
    // Distinct from the generic catchall - a save failure and a generic
    // backend error are different situations and must not dedupe on the
    // same toastId.
    expect(EVENT_SAVE_UNAVAILABLE_TOAST_ID).not.toBe(GENERIC_ERROR_TOAST_ID);
  });

  it("logs once and does not reload on a server error", () => {
    // Carries a `response` like a real 500 from `createApiError`: backend
    // availability is judged on the response status, not the message text.
    const error = createServerError();

    handleError(error);

    // No reload: the mutation layer reconciles the cache after failures, and
    // a reload would wipe every live optimistic update. console.error firing
    // proves handleError reached the notify path (rather than early-returning).
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      $exception_handled: true,
      $exception_source: "event-mutation",
      httpStatus: Status.INTERNAL_SERVER,
    });
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0]?.[1]).toMatchObject({
      toastId: GENERIC_ERROR_TOAST_ID,
    });
  });

  it("does not stack a second catchall toast while one is already visible", () => {
    mocks.isActive.mockReturnValue(true);
    const error = createServerError();

    handleError(error);
    handleError(error);

    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("ignores unauthorized errors using response.status even when the message is enriched", () => {
    const error = new Error(
      "Request failed for GET /user/profile with status 401",
    ) as ApiError;
    error.name = "ApiError";
    error.response = { status: Status.UNAUTHORIZED } as ApiResponse<unknown>;

    handleError(error);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("shows a toast on a 404 instead of silently reverting the optimistic edit", () => {
    // Not a session failure (unlike GONE/UNAUTHORIZED) - the api interceptor
    // only console.error's a 404 and rethrows, so without this the user's
    // edit rolls back with zero visible feedback at all.
    const error = createServerError(Status.NOT_FOUND);

    handleError(error);

    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0]?.[1]).toMatchObject({
      toastId: GENERIC_ERROR_TOAST_ID,
    });
  });

  it("does not report a backend-authored mutation failure", () => {
    // A 502 PROVIDER_FAILURE the backend authored: it answered (so it isn't
    // "unavailable"), and it's retryable, so the user just needs a nudge. It
    // must not console.error - otherwise every transient provider hiccup
    // becomes a fresh error-tracking issue via capture_console_errors.
    const error = createServerError(502);
    error.response = {
      status: 502,
      data: {
        code: "PROVIDER_FAILURE",
        message: "Google rejected the write",
        retryable: true,
      },
    } as ApiResponse<unknown>;

    handleError(error);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0]?.[1]).toMatchObject({
      toastId: GENERIC_ERROR_TOAST_ID,
    });
  });

  it("does not report a non-retryable domain mutation failure", () => {
    const error = createServerError(Status.FORBIDDEN);
    error.response = {
      status: Status.FORBIDDEN,
      data: {
        code: "CALENDAR_READ_ONLY",
        message: "Calendar is read-only",
        retryable: false,
      },
    } as ApiResponse<unknown>;

    handleError(error);

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("shows curated copy for a mutation failure the user can act on, not the catch-all", () => {
    // A deterministic provider refusal (Google declining a birthday-occurrence
    // delete) used to show "Something went wrong behind the scenes. Please try
    // again later." — an invitation to retry something that can never work.
    const error = createServerError(Status.FORBIDDEN);
    error.response = {
      status: Status.FORBIDDEN,
      data: {
        code: "UNSUPPORTED_OPERATION",
        message: "backend contract message, not toast copy",
        retryable: false,
      },
    } as ApiResponse<unknown>;

    handleError(error);

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledTimes(1);
    const [message] = mocks.error.mock.calls[0] ?? [];
    expect(message).toContain("Your calendar doesn't allow this change");
    expect(message).not.toBe(
      "Something went wrong behind the scenes. Please try again later.",
    );
  });

  it("does not toast a BILLING_REQUIRED refusal — the gate is the feedback", () => {
    const error = createServerError(Status.FORBIDDEN);
    error.response = {
      status: Status.FORBIDDEN,
      data: {
        code: "BILLING_REQUIRED",
        message: "A trial or subscription is required to change events",
        retryable: false,
      },
    } as ApiResponse<unknown>;

    handleError(error);

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe("isEventInRange", () => {
  it("returns true if event is in range", () => {
    const event = { start: "2022-03-15", end: "2022-03-15" };
    const dates = {
      start: "2022-03-14",
      end: "2022-03-19",
    };
    expect(isEventInRange(event, dates)).toBe(true);
  });

  it("returns false if event is not in range", () => {
    const event = { start: "2022-03-15", end: "2022-03-15" };
    const dates = {
      start: "2022-03-16",
      end: "2022-03-19",
    };
    expect(isEventInRange(event, dates)).toBe(false);
  });
});

describe("addId", () => {
  it("should add a raw MongoID", () => {
    const event = {
      ...createMockStandaloneEvent(),
      _id: "existing-id",
    } as GridEvent;
    const result = addId(event);

    expect(result._id).toBeDefined();
    expect(ObjectId.isValid(result._id)).toBe(true);
    expect(result._id).toMatch(/^[a-f0-9]{24}$/);
  });
});

const EVENT_ID = "507f1f77bcf86cd799439011";

/**
 * The three focus helpers all retry across animation frames, so every suite
 * below needs the same seam: a stubbed `requestAnimationFrame` whose queue the
 * test drains by hand, plus a way to mount an event card mid-retry.
 */
const setupFocusRetryHarness = () => {
  let pendingFrames: FrameRequestCallback[] = [];
  let originalRequestAnimationFrame: typeof requestAnimationFrame;

  beforeEach(() => {
    pendingFrames = [];
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((frame: FrameRequestCallback) =>
      pendingFrames.push(frame)) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    document.body.innerHTML = "";
  });

  return {
    addEventElement: () => {
      const element = document.createElement("div");
      element.setAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, EVENT_ID);
      element.tabIndex = 0;
      document.body.appendChild(element);
      return element;
    },
    flushFrame: () => {
      const frames = pendingFrames.splice(0);
      frames.forEach((frame) => frame(performance.now()));
    },
    pendingFrameCount: () => pendingFrames.length,
  };
};

describe("focusCalendarEventElement", () => {
  const { addEventElement, flushFrame, pendingFrameCount } =
    setupFocusRetryHarness();

  it("focuses the event element when it already exists", () => {
    const element = addEventElement();

    focusCalendarEventElement(EVENT_ID);

    expect(document.activeElement).toBe(element);
    expect(pendingFrameCount()).toBe(0);
  });

  it("retries until the event element appears", () => {
    focusCalendarEventElement(EVENT_ID);
    flushFrame();

    expect(document.activeElement).not.toBeInstanceOf(HTMLDivElement);

    const element = addEventElement();
    flushFrame();

    expect(document.activeElement).toBe(element);
  });

  it("gives up once the retry budget is spent", () => {
    focusCalendarEventElement(EVENT_ID);

    let flushes = 0;
    while (pendingFrameCount() > 0 && flushes < 100) {
      flushFrame();
      flushes += 1;
    }

    expect(flushes).toBeLessThan(100);
    const element = addEventElement();
    flushFrame();
    expect(document.activeElement).not.toBe(element);
  });
});

describe("focusCalendarEventElementAfterDiscard", () => {
  const { addEventElement, flushFrame } = setupFocusRetryHarness();

  it("skips a draft portal and focuses the saved card", () => {
    const draftPortal = addEventElement();
    draftPortal.setAttribute("data-grid-event-surface", "draft");
    const savedCard = addEventElement();

    focusCalendarEventElementAfterDiscard(EVENT_ID);
    flushFrame();

    expect(document.activeElement).toBe(savedCard);
  });

  it("waits for a remounted card when only a draft portal is present", () => {
    const draftPortal = addEventElement();
    draftPortal.setAttribute("data-grid-event-surface", "draft");

    focusCalendarEventElementAfterDiscard(EVENT_ID);
    flushFrame();

    expect(document.activeElement).not.toBe(draftPortal);

    draftPortal.remove();
    const savedCard = addEventElement();
    flushFrame();

    expect(document.activeElement).toBe(savedCard);
  });
});

describe("refocusEventElement", () => {
  const { addEventElement, flushFrame, pendingFrameCount } =
    setupFocusRetryHarness();

  it("focuses the event's element once it is replaced", () => {
    const staleElement = addEventElement();
    staleElement.focus();

    refocusEventElement(EVENT_ID);
    flushFrame();

    // Simulate React replacing the element on the next render.
    staleElement.remove();
    const newElement = addEventElement();
    flushFrame();

    expect(document.activeElement).toBe(newElement);
  });

  it("does not refocus the stale element and stops retrying", () => {
    const staleElement = addEventElement();
    staleElement.focus();
    staleElement.blur();

    refocusEventElement(EVENT_ID);

    let flushes = 0;
    while (pendingFrameCount() > 0 && flushes < 100) {
      flushFrame();
      flushes += 1;
    }

    expect(document.activeElement).not.toBe(staleElement);
    expect(flushes).toBeLessThanOrEqual(31);
  });
});
