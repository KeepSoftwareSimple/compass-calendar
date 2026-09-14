import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as trackModule from "@web/auth/posthog/track";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import {
  getHintPlainText,
  getShortcutHint,
} from "@web/shortcuts/tips/shortcut-tips.data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
} from "bun:test";

const track = mock();

mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

const {
  beginShortcutSuggestionPresentation,
  recordShortcutInvocation,
  resetShortcutTelemetryForTests,
  IMPRESSION_DWELL_MS,
} = await import("@web/shortcuts/tips/shortcut-telemetry");

const suggestion = {
  ...getShortcutHint("page-jump"),
  reasonCode: "calendar_idle" as const,
};

const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
const visibilityDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState",
);

const setDocumentHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
};

const restoreDocumentVisibility = () => {
  if (hiddenDescriptor) {
    Object.defineProperty(document, "hidden", hiddenDescriptor);
  } else {
    Reflect.deleteProperty(document, "hidden");
  }
  if (visibilityDescriptor) {
    Object.defineProperty(document, "visibilityState", visibilityDescriptor);
  } else {
    Reflect.deleteProperty(document, "visibilityState");
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  track.mockClear();
  resetShortcutTelemetryForTests();
  localStorage.clear();
  setDocumentHidden(false);
});

afterEach(() => {
  resetShortcutTelemetryForTests();
  restoreDocumentVisibility();
  jest.useRealTimers();
  localStorage.clear();
});

describe("shortcut suggestion dwell impressions", () => {
  it("records nothing when the tip is replaced before 5 seconds", () => {
    const cleanup = beginShortcutSuggestionPresentation(suggestion, 0);
    jest.advanceTimersByTime(2_000);
    cleanup();
    beginShortcutSuggestionPresentation(
      { ...getShortcutHint("create-event"), reasonCode: "calendar_idle" },
      2_000,
    );
    jest.advanceTimersByTime(2_000);

    expect(track).not.toHaveBeenCalled();
    expect(
      readShortcutUsageProfile().actions["calendar.page_jump"],
    ).toBeUndefined();
  });

  it("records one shown event and one recentImpressions after 5 seconds", () => {
    beginShortcutSuggestionPresentation(suggestion, 0);
    jest.advanceTimersByTime(IMPRESSION_DWELL_MS);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("shortcut_suggestion_shown", {
      action_id: "calendar.page_jump",
      dwell_ms: IMPRESSION_DWELL_MS,
      feature_area: "calendar_navigation",
      outcome: "shown",
      rank: 1,
      reason_code: "calendar_idle",
      shortcut_type: "page-jump",
      source: "sidebar_status",
      suggestion_text: getHintPlainText(suggestion),
    });
    expect(
      readShortcutUsageProfile().actions["calendar.page_jump"],
    ).toMatchObject({ recentImpressions: 1 });
  });

  it("records nothing while hidden at 5 seconds until the tab is visible", () => {
    beginShortcutSuggestionPresentation(suggestion, 0);
    setDocumentHidden(true);
    jest.advanceTimersByTime(IMPRESSION_DWELL_MS);

    expect(track).not.toHaveBeenCalled();

    setDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      "shortcut_suggestion_shown",
      expect.objectContaining({ dwell_ms: IMPRESSION_DWELL_MS }),
    );
  });

  it("still reports was_suggested for an invocation at 1 second", () => {
    beginShortcutSuggestionPresentation(suggestion, 0);
    jest.advanceTimersByTime(1_000);

    recordShortcutInvocation("page-jump", 1_000);

    expect(track).toHaveBeenCalledWith(
      "shortcut_invoked",
      expect.objectContaining({
        shortcut_type: "page-jump",
        was_suggested: true,
      }),
    );
  });
});
