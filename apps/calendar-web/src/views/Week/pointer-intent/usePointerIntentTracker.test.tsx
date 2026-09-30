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
  initialPageJumpHintState,
  selectPageJumpHintsVisible,
  usePageJumpHintStore,
} from "@web/shortcuts/page-jump/page-jump.store";
import { setTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { WEEK_EVENT_ID_ATTRIBUTE } from "@web/views/Week/pointer-intent/grid-pointer-target";
import {
  registerPointerIntentKeysLookup,
  resetPageJumpChipDemoForTests,
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
    "edit-move-later": ["Shift", "ArrowDown"],
    "edit-move-hour-later": ["Alt", "Shift", "ArrowDown"],
    "create-typed-time": ["1130"],
    "create-timed": ["C"],
    "nav-scroll-hour-down": ["Alt", "ArrowDown"],
    "nav-today": ["T"],
    "focus-page-jump": ["Mod"],
  };
  return keys[id];
};

function mountHoverHuntButtons() {
  const first = document.createElement("button");
  first.id = "hover-hunt-one";
  const second = document.createElement("button");
  second.id = "hover-hunt-two";
  const third = document.createElement("button");
  third.id = "hover-hunt-three";
  document.body.append(first, second, third);

  let target: Element | null = null;
  document.elementFromPoint = (() =>
    target) as typeof document.elementFromPoint;

  const hoverOver = (element: HTMLElement) => {
    target = element;
    fireEvent.pointerMove(document, {
      clientX: 8,
      clientY: 8,
      pointerId: 2,
      pointerType: "mouse",
    });
  };

  return { hoverOver, first, second, third };
}

const waitHoverSample = () => new Promise((r) => setTimeout(r, 110));

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

describe("usePointerIntentTracker", () => {
  beforeEach(() => {
    track.mockClear();
    capture.mockClear();
    resetPointerIntentSessionForTests();
    resetPageJumpChipDemoForTests();
    setTipsMuted(false);
    registerPointerIntentKeysLookup(lookup);
    usePointerHintStore.setState(initialPointerHintState, true);
    usePageJumpHintStore.setState(initialPageJumpHintState, true);
    useDraftStore.setState(initialDraftState, true);
    mountGridDom();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetPointerIntentSessionForTests();
    resetPageJumpChipDemoForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
    usePageJumpHintStore.setState(initialPageJumpHintState, true);
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

  it("reveals page-jump hints after hovering three distinct controls", async () => {
    render(<TrackerHarness />);
    const { hoverOver, first, second, third } = mountHoverHuntButtons();

    hoverOver(first);
    await waitHoverSample();
    hoverOver(second);
    await waitHoverSample();
    hoverOver(third);

    expect(usePointerHintStore.getState().pulse).toBe(1);
    expect(usePointerHintStore.getState().latestAttempt?.message).toMatch(
      /^Hold (Cmd|Ctrl) to see where you can jump\.$/,
    );
    expect(selectPageJumpHintsVisible(usePageJumpHintStore.getState())).toBe(
      true,
    );
    expect(
      capture.mock.calls.some(
        ([event, props]) =>
          event === "pointer_intent_detected" &&
          (props as { intent?: string }).intent === "hover-hunt",
      ),
    ).toBe(true);
  });

  it("cancels hover-hunt when the user clicks inside the window", async () => {
    render(<TrackerHarness />);
    const { hoverOver, first, second, third } = mountHoverHuntButtons();

    hoverOver(first);
    await waitHoverSample();
    hoverOver(second);
    fireEvent.pointerDown(third, { button: 0, pointerId: 3 });
    await waitHoverSample();
    hoverOver(third);

    expect(usePointerHintStore.getState().pulse).toBe(0);
    expect(
      capture.mock.calls.some(
        ([event, props]) =>
          event === "pointer_intent_detected" &&
          (props as { intent?: string }).intent === "hover-hunt",
      ),
    ).toBe(false);
  });

  it("does not fire hover-hunt with only two distinct targets", async () => {
    render(<TrackerHarness />);
    const { hoverOver, first, second } = mountHoverHuntButtons();

    hoverOver(first);
    await waitHoverSample();
    hoverOver(second);
    await waitHoverSample();
    hoverOver(first);

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

    render(<TrackerHarness />);
    const { hoverOver, first, second, third } = mountHoverHuntButtons();

    hoverOver(first);
    await waitHoverSample();
    hoverOver(second);
    await waitHoverSample();
    hoverOver(third);

    expect(usePointerHintStore.getState().pulse).toBe(1);
    expect(selectPageJumpHintsVisible(usePageJumpHintStore.getState())).toBe(
      false,
    );
  });
});
