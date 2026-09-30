import { fireEvent } from "@testing-library/react";
import {
  maybePulseContextMenuOpenedByPointer,
  resetContextMenuPointerHintForTests,
} from "@web/shortcuts/context-menu/context-menu-pointer-hint";
import { resetPointerHintPersistenceForTests } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  selectPointerHintPulse,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("context-menu pointer hint", () => {
  beforeEach(() => {
    resetContextMenuPointerHintForTests();
    resetPointerIntentSessionForTests();
    resetPointerHintPersistenceForTests();
    writeShortcutUsageProfile({ version: 2, actions: {}, shortcuts: {} });
    usePointerHintStore.setState({
      pulse: 0,
      latestAttempt: null,
      isVisible: false,
    });
  });

  afterEach(() => {
    resetContextMenuPointerHintForTests();
    resetPointerIntentSessionForTests();
  });

  it("pulses once per session for edit-menu", () => {
    maybePulseContextMenuOpenedByPointer("/week");
    expect(selectPointerHintPulse(usePointerHintStore.getState())).toBe(1);

    maybePulseContextMenuOpenedByPointer("/week");
    expect(selectPointerHintPulse(usePointerHintStore.getState())).toBe(1);
  });

  it("records clientX on synthetic contextmenu events for tests", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    let clientX = -1;
    target.addEventListener("contextmenu", (event) => {
      clientX = event.clientX;
    });
    fireEvent.contextMenu(target, { clientX: 48, clientY: 48 });
    expect(clientX).toBe(48);
    target.remove();
  });
});
