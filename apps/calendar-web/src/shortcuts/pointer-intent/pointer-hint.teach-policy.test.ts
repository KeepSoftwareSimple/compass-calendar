import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  MAX_POINTER_HINTS_PER_SESSION,
  shouldTeachPointerHint,
} from "@web/shortcuts/pointer-intent/pointer-hint.teach-policy";
import {
  type ShortcutUsageProfile,
  writeShortcutUsageProfile,
} from "@web/shortcuts/tips/shortcut-personalization.storage";
import { setTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const profileWith = (ids: string[]): ShortcutUsageProfile => ({
  version: 2,
  actions: {},
  shortcuts: Object.fromEntries(
    ids.map((id) => [id, { invocations: 1, recentImpressions: 0 }]),
  ),
});

const gateFor = (shortcutId: "edit-menu" | "nav-today" = "edit-menu") => ({
  shortcutId,
  alreadyShown: false,
  hintsShownThisSession: 0,
});

describe("shouldTeachPointerHint", () => {
  beforeEach(() => {
    clearAppLockReasons();
    setTipsMuted(false);
    usePointerHintStore.setState(initialPointerHintState, true);
    writeShortcutUsageProfile(profileWith([]));
  });

  afterEach(() => {
    clearAppLockReasons();
    setTipsMuted(false);
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("teaches a fresh shortcut on a quiet session", () => {
    expect(shouldTeachPointerHint(gateFor())).toBe(true);
  });

  it("refuses a signal that already taught this session", () => {
    expect(shouldTeachPointerHint({ ...gateFor(), alreadyShown: true })).toBe(
      false,
    );
  });

  it("refuses once the session cap is spent", () => {
    expect(
      shouldTeachPointerHint({
        ...gateFor(),
        hintsShownThisSession: MAX_POINTER_HINTS_PER_SESSION,
      }),
    ).toBe(false);
  });

  it("retires a shortcut the profile already records as invoked", () => {
    writeShortcutUsageProfile(profileWith(["edit-menu"]));
    expect(shouldTeachPointerHint(gateFor())).toBe(false);
  });

  it("refuses while tips are muted, dismissed, locked, or a pill shows", () => {
    setTipsMuted(true);
    expect(shouldTeachPointerHint(gateFor())).toBe(false);
    setTipsMuted(false);

    expect(
      shouldTeachPointerHint({
        ...gateFor(),
        tipsDismissedPermanently: true,
      }),
    ).toBe(false);

    setAppLockReason("test:lock", true);
    expect(shouldTeachPointerHint(gateFor())).toBe(false);
    clearAppLockReasons();

    expect(shouldTeachPointerHint({ ...gateFor(), pillVisible: true })).toBe(
      false,
    );
  });

  it("refuses every surface once the browser reaches Explorer", () => {
    writeShortcutUsageProfile(
      profileWith(["edit-open", "create-timed", "nav-previous", "nav-next"]),
    );
    expect(shouldTeachPointerHint(gateFor("edit-menu"))).toBe(false);
    expect(shouldTeachPointerHint(gateFor("nav-today"))).toBe(false);
  });
});
