import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  MAX_POINTER_HINTS_PER_SESSION,
  shouldTeachPointerIntent,
  teachingMessageForIntent,
} from "@web/shortcuts/pointer-intent/pointer-intent";
import {
  detectedIntents,
  getPointerIntentSessionSnapshot,
  markPointerIntentHintShown,
  recordPointerIntentDetection,
  resetPointerIntentSessionForTests,
} from "@web/shortcuts/pointer-intent/pointer-intent.session";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { setTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("shouldTeachPointerIntent", () => {
  beforeEach(() => {
    resetPointerIntentSessionForTests();
    clearAppLockReasons();
    setTipsMuted(false);
    usePointerHintStore.setState(initialPointerHintState, true);
    writeShortcutUsageProfile({ version: 2, actions: {}, shortcuts: {} });
  });

  afterEach(() => {
    resetPointerIntentSessionForTests();
    clearAppLockReasons();
    setTipsMuted(false);
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("teaches each intent at most once per session", () => {
    const session = getPointerIntentSessionSnapshot();
    expect(shouldTeachPointerIntent({ intent: "card-click", session })).toBe(
      true,
    );
    markPointerIntentHintShown("card-click");
    const after = getPointerIntentSessionSnapshot();
    expect(
      shouldTeachPointerIntent({ intent: "card-click", session: after }),
    ).toBe(false);
  });

  it("refuses a fourth hint in the same session", () => {
    markPointerIntentHintShown("card-click");
    markPointerIntentHintShown("slot-click");
    markPointerIntentHintShown("allday-click");
    const session = getPointerIntentSessionSnapshot();
    expect(session.hintsShownThisSession).toBe(MAX_POINTER_HINTS_PER_SESSION);
    expect(shouldTeachPointerIntent({ intent: "grid-scroll", session })).toBe(
      false,
    );
  });

  it("retires an intent when the first registry id was already used", () => {
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: {
        "edit-open": { invocations: 1, recentImpressions: 0 },
      },
    });
    expect(
      shouldTeachPointerIntent({
        intent: "card-click",
        session: getPointerIntentSessionSnapshot(),
      }),
    ).toBe(false);
  });

  it("refuses teaching when tips are muted", () => {
    setTipsMuted(true);
    expect(
      shouldTeachPointerIntent({
        intent: "card-click",
        session: getPointerIntentSessionSnapshot(),
        tipsMuted: true,
      }),
    ).toBe(false);
  });

  it("records detected intents for newcomer tip ranking", () => {
    recordPointerIntentDetection("swipe-next");
    expect(detectedIntents()).toEqual(["swipe-next"]);
  });

  it("refuses teaching while the app lock is held", () => {
    setAppLockReason("test:lock", true);
    expect(
      shouldTeachPointerIntent({
        intent: "card-click",
        session: getPointerIntentSessionSnapshot(),
        appLocked: true,
      }),
    ).toBe(false);
  });
});

describe("teachingMessageForIntent", () => {
  it("fills slot-click copy from context", () => {
    expect(
      teachingMessageForIntent("slot-click", {
        timeKey: "1130",
        timeLabel: "11:30 AM",
      }),
    ).toBe("Type 1130 to create at 11:30 AM, or press {1}.");
  });
});
