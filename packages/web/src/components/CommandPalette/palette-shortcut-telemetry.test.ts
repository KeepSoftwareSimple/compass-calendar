import { pulsePaletteTaughtShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import { writePointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { usePointerHintStore } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { describe, expect, it } from "bun:test";

describe("pulsePaletteTaughtShortcut", () => {
  it("pulses the pointer hint for a row with a shortcut", () => {
    pulsePaletteTaughtShortcut("t");
    expect(usePointerHintStore.getState().latestAttempt).toEqual({
      actionId: "unknown",
      shortcutKey: "t",
      performed: true,
      source: "palette",
    });
    expect(usePointerHintStore.getState().pulse).toBe(1);
  });

  it("does not pulse for a row without a shortcut", () => {
    pulsePaletteTaughtShortcut(undefined);
    expect(usePointerHintStore.getState().latestAttempt).toBeNull();
    expect(usePointerHintStore.getState().pulse).toBe(0);
  });

  it("skips the palette hint when keyboard tips are off", () => {
    writePointerHintDismissedPermanently();
    pulsePaletteTaughtShortcut("t");
    expect(usePointerHintStore.getState().pulse).toBe(0);
  });
});
