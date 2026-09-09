import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const capture = mock();
let client: { capture: typeof capture } | undefined = { capture };

// bun's mock.module is global and leaks into every other test file in the
// run. Spread the real module so unrelated suites still see its full
// surface, and only override getPosthogClient while this file runs - the
// flag flips back to the real implementation in afterAll.
const actualPosthogBootstrap = {
  ...(await import("@web/auth/posthog/posthog.bootstrap")),
};
let isClientMocked = true;

mock.module("@web/auth/posthog/posthog.bootstrap", () => ({
  ...actualPosthogBootstrap,
  getPosthogClient: () =>
    isClientMocked ? client : actualPosthogBootstrap.getPosthogClient(),
}));

afterAll(() => {
  isClientMocked = false;
});

const { track } = await import("./track");
const {
  beginShortcutSuggestionPresentation,
  recordShortcutInvocation,
  recordShortcutUnavailableAttempt,
  resetShortcutTelemetryForTests,
} = await import("@web/shortcuts/tips/shortcut-telemetry");
const { clearAppLockReasons, setAppLockReason } = await import(
  "@web/shortcuts/app-lock"
);
const { getHintPlainText, getShortcutHint } = await import(
  "@web/shortcuts/tips/shortcut-tips.data"
);
const { readShortcutUsageProfile } = await import(
  "@web/shortcuts/tips/shortcut-personalization.storage"
);

beforeEach(() => {
  capture.mockClear();
  client = { capture };
  resetShortcutTelemetryForTests();
});

describe("track", () => {
  it("forwards the event name and properties to the PostHog client", () => {
    track("signup_started", { source: "welcome_modal" });

    expect(capture).toHaveBeenCalledWith("signup_started", {
      source: "welcome_modal",
    });
  });

  it("no-ops when PostHog is not initialized", () => {
    client = undefined;

    expect(() => track("event_created")).not.toThrow();
  });

  it("does not let a synchronous analytics failure interrupt the product", () => {
    capture.mockImplementationOnce(() => {
      throw new Error("capture unavailable");
    });

    expect(() => track("event_created")).not.toThrow();
  });
});

describe("shortcut telemetry", () => {
  it("captures one privacy-safe shown event and deduplicates an immediate remount", () => {
    const suggestion = {
      ...getShortcutHint("page-jump"),
      reasonCode: "calendar_idle" as const,
    };

    beginShortcutSuggestionPresentation(suggestion, 100_000);
    beginShortcutSuggestionPresentation(suggestion, 100_001);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("shortcut_suggestion_shown", {
      action_id: "calendar.page_jump",
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
    ).toMatchObject({ recentImpressions: 1, lastShownAt: 100_000 });
  });

  it("records successful invocation and engagement with the visible suggestion", () => {
    beginShortcutSuggestionPresentation(
      {
        ...getShortcutHint("page-jump"),
        reasonCode: "local_discovery",
      },
      100_000,
    );
    capture.mockClear();

    recordShortcutInvocation("page-jump", 200_000);

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, "shortcut_invoked", {
      action_id: "calendar.page_jump",
      feature_area: "calendar_navigation",
      invocation_method: "keyboard",
      outcome: "succeeded",
      reason_code: "registered_shortcut",
      shortcut_type: "page-jump",
      source: "keyboard",
      suggestion_text: getHintPlainText(getShortcutHint("page-jump")),
      was_suggested: true,
    });
    expect(capture).toHaveBeenNthCalledWith(2, "shortcut_suggestion_engaged", {
      action_id: "calendar.page_jump",
      feature_area: "calendar_navigation",
      invocation_method: "keyboard",
      outcome: "invoked",
      rank: 1,
      reason_code: "local_discovery",
      shortcut_type: "page-jump",
      source: "sidebar_status",
      suggestion_text: getHintPlainText(getShortcutHint("page-jump")),
      was_suggested: true,
    });
    expect(
      readShortcutUsageProfile().actions["calendar.page_jump"],
    ).toMatchObject({ invocations: 1, lastInvokedAt: 200_000 });
  });

  it("captures which shortcut was blocked, by which lock owners, where", () => {
    window.history.pushState({}, "", "/week/2026-09-06");
    setAppLockReason("settingsModal", true);
    setAppLockReason("billingGate", true);
    setAppLockReason("overlayPanel:settings::r3:", true);
    setAppLockReason("overlayPanel:settings::r79:", true);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    recordShortcutUnavailableAttempt("edge-focus", "billing_locked", {
      hotkey: "Tab",
      event: {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        repeat: true,
      },
    });

    expect(capture).toHaveBeenCalledWith("shortcut_unavailable_attempt", {
      action_id: "event.edge_focus",
      active_element: "input",
      context: "billingGate+overlayPanel:settings+settingsModal",
      feature_area: "event_editing",
      invocation_method: "keyboard",
      is_repeat: true,
      outcome: "unavailable",
      reason_code: "billing_locked",
      shortcut_key: "Tab",
      shortcut_type: "edge-focus",
      source: "keyboard",
      suggestion_text: getHintPlainText(getShortcutHint("edge-focus")),
      view: "week_view",
      was_modifier_held: false,
    });
    input.remove();
    clearAppLockReasons();
  });

  it("names the lock context unknown when no reason is registered", () => {
    window.history.pushState({}, "", "/day");
    recordShortcutUnavailableAttempt("nudge", "overlay_open", {
      hotkey: { key: "ArrowLeft", shift: true },
      event: {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        repeat: false,
      },
    });

    expect(capture).toHaveBeenCalledWith(
      "shortcut_unavailable_attempt",
      expect.objectContaining({
        context: "unknown",
        invocation_method: "keyboard",
        reason_code: "overlay_open",
        shortcut_key: "Shift+ArrowLeft",
        shortcut_type: "nudge",
        view: "day_view",
        was_modifier_held: true,
      }),
    );
  });

  it("marks an independent invocation as not suggested", () => {
    recordShortcutInvocation("create-event", 200_000);

    expect(capture).toHaveBeenCalledWith("shortcut_invoked", {
      action_id: "calendar.create_timed_event",
      feature_area: "event_creation",
      invocation_method: "keyboard",
      outcome: "succeeded",
      reason_code: "registered_shortcut",
      shortcut_type: "create-event",
      source: "keyboard",
      suggestion_text: getHintPlainText(getShortcutHint("create-event")),
      was_suggested: false,
    });
    expect(capture).not.toHaveBeenCalledWith(
      "shortcut_suggestion_engaged",
      expect.anything(),
    );
  });

  it("records click invocation method and click unavailable attempts", () => {
    recordShortcutInvocation("save-draft", 200_000, "click");

    expect(capture).toHaveBeenCalledWith(
      "shortcut_invoked",
      expect.objectContaining({
        invocation_method: "click",
        shortcut_type: "save-draft",
        source: "click",
        was_suggested: false,
      }),
    );

    capture.mockClear();
    recordShortcutUnavailableAttempt("create-event", "billing_locked", {
      invocationMethod: "click",
    });

    expect(capture).toHaveBeenCalledWith(
      "shortcut_unavailable_attempt",
      expect.objectContaining({
        invocation_method: "click",
        reason_code: "billing_locked",
        shortcut_type: "create-event",
        source: "click",
        suggestion_text: getHintPlainText(getShortcutHint("create-event")),
      }),
    );
  });
});
