import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as trackModule from "@web/auth/posthog/track";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { pulseClickTaughtShortcut } from "./pulse-click-taught-shortcut";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

describe("pulseClickTaughtShortcut", () => {
  beforeEach(() => {
    track.mockClear();
    resetPointerIntentSessionForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
    writeShortcutUsageProfile({ version: 2, actions: {}, shortcuts: {} });
  });

  it("pulses once per shortcut id per session", () => {
    pulseClickTaughtShortcut("nav-previous");
    pulseClickTaughtShortcut("nav-previous");

    expect(usePointerHintStore.getState().pulse).toBe(1);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("does not pulse after the shortcut has been invoked", () => {
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: {
        "nav-previous": { invocations: 1, recentImpressions: 0 },
      },
    });

    pulseClickTaughtShortcut("nav-previous");

    expect(usePointerHintStore.getState().isVisible).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });
});
