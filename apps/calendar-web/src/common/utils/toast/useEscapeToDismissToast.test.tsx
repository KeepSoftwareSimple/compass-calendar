import { HotkeyManager } from "@tanstack/react-hotkeys";
import { renderHook } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import { useEscapeToDismissToast } from "@web/common/utils/toast/useEscapeToDismissToast";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import {
  clearFloatingLayerReasons,
  setFloatingLayerReason,
} from "@web/shortcuts/floating-layer";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("useEscapeToDismissToast", () => {
  let mocks: ReturnType<typeof createTestToastPort>["mocks"];

  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    clearFloatingLayerReasons();

    const testPort = createTestToastPort();
    mocks = testPort.mocks;
    registerToastPort(testPort.port);
  });

  afterEach(() => {
    resetToastPort();
    document.body.innerHTML = "";
    draftActions.discard();
    clearFloatingLayerReasons();
  });

  it("dismisses the visible toast on Escape", () => {
    renderHook(() => useEscapeToDismissToast());

    pressKey("Escape");

    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.dismiss).toHaveBeenCalledWith();
  });

  it("does not dismiss while the event form is open", () => {
    draftActions.startGridDraft({
      activity: "gridClick",
      draft: createGridEventDraft(
        timedGridSchedule(
          new Date("2026-05-20T09:00:00.000Z"),
          new Date("2026-05-20T10:00:00.000Z"),
        ),
      ),
    });
    draftActions.setFormOpen(true);

    renderHook(() => useEscapeToDismissToast());
    pressKey("Escape");

    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("does not dismiss while a floating layer is open", () => {
    setFloatingLayerReason("test-layer", true);

    renderHook(() => useEscapeToDismissToast());
    pressKey("Escape");

    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("does not dismiss while the context-menu floating layer is registered", () => {
    // Mirrors ContextMenu's useFloatingLayer("contextMenu", …) reason so a
    // broken/missing wire-up would fail this stand-down check.
    setFloatingLayerReason("contextMenu", true);

    renderHook(() => useEscapeToDismissToast());
    pressKey("Escape");

    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("does not dismiss while the app is locked (a modal is open)", () => {
    document.body.dataset.appLocked = "true";

    renderHook(() => useEscapeToDismissToast());
    pressKey("Escape");

    expect(mocks.dismiss).not.toHaveBeenCalled();
  });
});
