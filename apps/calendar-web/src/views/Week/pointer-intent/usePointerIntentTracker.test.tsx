import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FC } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as posthogBootstrap from "@web/auth/posthog/posthog.bootstrap";
import * as trackModule from "@web/auth/posthog/track";
import {
  ID_GRID_COLUMNS_TIMED,
  ID_GRID_MAIN,
} from "@web/common/constants/web.constants";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { POINTER_EVENT_JUMP_REQUEST } from "@web/shortcuts/keyboard-only/pointer-grid-bridge";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  pageJumpHintActions,
  usePageJumpHintStore,
} from "@web/shortcuts/page-jump/page-jump.store";
import { setTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { WEEK_EVENT_ID_ATTRIBUTE } from "@web/views/Week/pointer-intent/grid-pointer-target";
import { HOVER_HUNT_SAMPLE_MS } from "@web/views/Week/pointer-intent/hover-hunt-tracker";
import {
  registerPointerIntentKeysLookup,
  resetHoverHuntChipTimerForTests,
} from "@web/views/Week/pointer-intent/pointer-intent.actions";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { usePointerIntentTracker } from "@web/views/Week/pointer-intent/usePointerIntentTracker";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const track = mock();
const capture = mock();

mockModuleForFile("@web/auth/posthog/track", trackModule, { track });
mockModuleForFile("@web/auth/posthog/posthog.bootstrap", posthogBootstrap, {
  getPosthogClient: () => ({ capture }),
});

const lookup = (id: string) => {
  const keys: Record<string, string[]> = {
    "edit-open": ["Enter"],
    "focus-shift-hold": ["H"],
    "focus-page-jump": ["Mod", "1-9"],
    "edit-move-later": ["Shift", "ArrowDown"],
    "edit-move-hour-later": ["Alt", "Shift", "ArrowDown"],
    "create-typed-time": ["1130"],
    "create-timed": ["C"],
    "nav-scroll-hour-down": ["Alt", "ArrowDown"],
    "nav-today": ["T"],
  };
  return keys[id];
};

const TrackerHarness: FC<{ enabled?: boolean }> = ({ enabled = true }) => {
  usePointerIntentTracker({ enabled, lookup });
  return null;
};

function mountGridDom() {
  document.body.innerHTML = `
    <div id="${ID_GRID_MAIN}" style="height: 1440px; overflow: auto">
      <div id="${ID_GRID_COLUMNS_TIMED}">
        <div data-grid-date="2026-09-29" style="width: 200px; height: 1440px"></div>
      </div>
    </div>
  `;
  const grid = document.getElementById(ID_GRID_MAIN)!;
  Object.defineProperty(grid, "scrollHeight", {
    value: 1440,
    configurable: true,
  });
  grid.scrollTop = 720;
}

function mountHoverHuntButtons() {
  const positions = [
    { id: "btn-a", left: 10, top: 10 },
    { id: "btn-b", left: 110, top: 10 },
    { id: "btn-c", left: 210, top: 10 },
  ] as const;
  for (const { id, left, top } of positions) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = id;
    button.textContent = id;
    button.style.position = "fixed";
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.width = "80px";
    button.style.height = "32px";
    document.body.appendChild(button);
  }
  return positions;
}

async function hoverButtons(
  positions: readonly { id: string; left: number; top: number }[],
) {
  for (const { id, left, top } of positions) {
    const button = document.getElementById(id)!;
    fireEvent.pointerMove(button, {
      clientX: left + 40,
      clientY: top + 16,
      pointerId: 1,
      pointerType: "mouse",
    });
    await new Promise((resolve) =>
      setTimeout(resolve, HOVER_HUNT_SAMPLE_MS + 10),
    );
  }
}

describe("usePointerIntentTracker", () => {
  beforeEach(() => {
    track.mockClear();
    capture.mockClear();
    resetPointerIntentSessionForTests();
    resetHoverHuntChipTimerForTests();
    setTipsMuted(false);
    registerPointerIntentKeysLookup(lookup);
    usePointerHintStore.setState(initialPointerHintState, true);
    pageJumpHintActions.reset();
    useDraftStore.setState(initialDraftState, true);
    mountGridDom();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetPointerIntentSessionForTests();
    resetHoverHuntChipTimerForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
    pageJumpHintActions.reset();
    useDraftStore.setState(initialDraftState, true);
  });

  it("pulses the card-click hint and requests event jump on pointerup", async () => {
    const user = userEvent.setup();
    const card = document.createElement("div");
    card.setAttribute(WEEK_EVENT_ID_ATTRIBUTE, "evt-card");
    document.body.appendChild(card);

    const jumpHandler = mock();
    document.addEventListener(POINTER_EVENT_JUMP_REQUEST, jumpHandler);

    render(<TrackerHarness />);
    await user.pointer({ keys: "[MouseLeft>]", target: card });
    await user.pointer({ keys: "[/MouseLeft]", target: card });

    const attempt = usePointerHintStore.getState().latestAttempt;
    expect(attempt?.source).toBe("pointer");
    expect(attempt?.shortcutKey).toEqual(["Enter"]);
    expect(jumpHandler).toHaveBeenCalledTimes(1);
  });

  it("shows drag teaching after 8px move and skips card-click on release", () => {
    const card = document.createElement("div");
    card.setAttribute(WEEK_EVENT_ID_ATTRIBUTE, "evt-drag");
    document.body.appendChild(card);

    render(<TrackerHarness />);
    fireEvent.pointerDown(card, {
      clientX: 0,
      clientY: 0,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(document, {
      clientX: 12,
      clientY: 0,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(document, {
      clientX: 12,
      clientY: 0,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });

    const attempt = usePointerHintStore.getState().latestAttempt;
    expect(attempt?.shortcutKey).toEqual(["Shift", "ArrowDown"]);
    expect(capture).toHaveBeenCalledWith(
      "pointer_intent_detected",
      expect.objectContaining({ intent: "card-drag" }),
    );
    expect(
      capture.mock.calls.some(
        ([event, props]) =>
          event === "pointer_intent_detected" &&
          (props as { intent?: string }).intent === "card-click",
      ),
    ).toBe(false);
  });

  it("pulses slot-click with digits for the timed column y", async () => {
    const user = userEvent.setup();
    render(<TrackerHarness />);
    const column = document.getElementById(ID_GRID_COLUMNS_TIMED)!
      .firstElementChild as HTMLElement;

    await user.pointer({
      keys: "[MouseLeft>]",
      target: column,
      coords: { clientY: 720 },
    });

    const attempt = usePointerHintStore.getState().latestAttempt;
    expect(attempt?.shortcutKey).toEqual(["1130"]);
  });

  it("pulses grid-scroll only after three wheel gestures", async () => {
    const user = userEvent.setup();
    const grid = document.getElementById(ID_GRID_MAIN)!;
    render(<TrackerHarness />);

    const wheel = async () => {
      await user.pointer({ target: grid, coords: { clientY: 10 } });
      grid.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 40,
          deltaX: 0,
          bubbles: true,
        }),
      );
    };

    await wheel();
    await new Promise((r) => setTimeout(r, 200));
    await wheel();
    await new Promise((r) => setTimeout(r, 200));
    expect(usePointerHintStore.getState().pulse).toBe(0);

    await wheel();
    expect(usePointerHintStore.getState().pulse).toBe(1);
    expect(
      capture.mock.calls.some(
        ([event, props]) =>
          event === "pointer_intent_detected" &&
          (props as { intent?: string }).intent === "grid-scroll",
      ),
    ).toBe(true);
  });

  it("reveals page-jump hints and pulses the pill after hovering three buttons", async () => {
    const positions = mountHoverHuntButtons();
    render(<TrackerHarness />);

    await hoverButtons(positions);

    expect(usePageJumpHintStore.getState().areHintsVisible).toBe(true);
    expect(usePointerHintStore.getState().pulse).toBe(1);
    expect(
      capture.mock.calls.some(
        ([event, props]) =>
          event === "pointer_intent_detected" &&
          (props as { intent?: string }).intent === "hover-hunt",
      ),
    ).toBe(true);
  });

  it("does not emit hover-hunt after only two distinct buttons", async () => {
    const positions = mountHoverHuntButtons();
    render(<TrackerHarness />);

    await hoverButtons(positions.slice(0, 2));

    expect(usePageJumpHintStore.getState().areHintsVisible).toBe(false);
    expect(usePointerHintStore.getState().pulse).toBe(0);
    expect(
      capture.mock.calls.some(
        ([event, props]) =>
          event === "pointer_intent_detected" &&
          (props as { intent?: string }).intent === "hover-hunt",
      ),
    ).toBe(false);
  });

  it("cancels hover-hunt when the user clicks inside the window", async () => {
    const positions = mountHoverHuntButtons();
    render(<TrackerHarness />);

    await hoverButtons(positions.slice(0, 2));
    fireEvent.pointerDown(document.getElementById("btn-b")!, {
      button: 0,
      clientX: 150,
      clientY: 26,
      pointerId: 1,
      pointerType: "mouse",
    });
    await hoverButtons([positions[2]!]);

    expect(usePageJumpHintStore.getState().areHintsVisible).toBe(false);
    expect(usePointerHintStore.getState().pulse).toBe(0);
  });

  it("pulses hover-hunt without page-jump chips while the event form is open", async () => {
    draftActions.startGridDraft({
      activity: "gridClick",
      draft: createGridEventDraft(
        timedGridSchedule(
          new Date("2026-05-20T10:00:00"),
          new Date("2026-05-20T11:00:00"),
        ),
      ),
    });
    const positions = mountHoverHuntButtons();
    render(<TrackerHarness />);

    await hoverButtons(positions);

    expect(usePageJumpHintStore.getState().areHintsVisible).toBe(false);
    expect(usePointerHintStore.getState().pulse).toBe(1);
  });

  it("records pointer_intent_detected when muted but not pointer_hint_shown", async () => {
    setTipsMuted(true);
    const user = userEvent.setup();
    render(<TrackerHarness />);
    const column = document.getElementById(ID_GRID_COLUMNS_TIMED)!
      .firstElementChild as HTMLElement;

    await user.pointer({
      keys: "[MouseLeft>]",
      target: column,
      coords: { clientY: 720 },
    });

    expect(capture).toHaveBeenCalledWith(
      "pointer_intent_detected",
      expect.objectContaining({ intent: "slot-click" }),
    );
    expect(
      track.mock.calls.some(([event]) => event === "pointer_hint_shown"),
    ).toBe(false);
    expect(usePointerHintStore.getState().pulse).toBe(0);
  });
});
