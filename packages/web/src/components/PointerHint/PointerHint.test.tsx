import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PointerHint } from "@web/components/PointerHint/PointerHint";
import {
  initialShortcutShowcaseState,
  shortcutShowcaseActions,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { welcomeGuideActions } from "@web/components/WelcomeModal/welcome.guide.store";
import { POINTER_ACTIONS } from "@web/shortcuts/keyboard-only/pointer-action";
import {
  readPointerHintDismissedPermanently,
  resetPointerHintPersistenceForTests,
} from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  initialPointerHintState,
  pointerHintActions,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  eventJumpActions,
  initialEventJumpState,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("PointerHint", () => {
  beforeEach(() => {
    resetPointerHintPersistenceForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState, true);
    useEventJumpStore.setState(initialEventJumpState, true);
    welcomeGuideActions.setFirstVisitOpen(false);
    welcomeGuideActions.close();
  });

  afterEach(() => {
    resetPointerHintPersistenceForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState, true);
    useEventJumpStore.setState(initialEventJumpState, true);
    welcomeGuideActions.setFirstVisitOpen(false);
    welcomeGuideActions.close();
  });

  it("stays hidden until a click pulses", () => {
    render(<PointerHint />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      pointerHintActions.pulse({ actionId: "unknown" });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Compass works from the keyboard. Press ? to see every shortcut.",
    );
  });

  it("omits the legend hint while the welcome modal is open", () => {
    welcomeGuideActions.setFirstVisitOpen(true);
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({ actionId: "unknown" });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Use the keys on this screen.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Press");
  });

  it("omits the legend hint while the welcome guide is open", () => {
    welcomeGuideActions.open();
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({ actionId: "unknown" });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Use the keys on this screen.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Press");
  });

  it("teaches the start-trial shortcut for the banner CTA", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.startTrial,
        shortcutKey: "S",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press S to start your trial.",
    );
  });

  it("teaches the reconnect shortcut for the banner CTA", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.reconnectGoogle,
        shortcutKey: "G",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press G to reconnect Google Calendar.",
    );
  });

  it("teaches the focus key, arrows, and Enter for the month picker", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.datePick,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press I to focus the calendar, then use the arrow keys and Enter to go to a date.",
    );
  });

  it("teaches Esc for the up-next dismiss target", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.upNextDismiss,
        shortcutKey: "Esc",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press Esc to dismiss.",
    );
  });

  it("teaches the sidebar close shortcut", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.sidebarClose,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press ] to close the sidebar.",
    );
  });

  it("teaches the sidebar open shortcut", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.sidebarOpen,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press ] to open the sidebar.",
    );
  });

  it("teaches the today shortcut", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.goToToday,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press T to go to today.",
    );
  });

  it("teaches view switching", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.switchView,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press W, D, or L to switch views.",
    );
  });

  it("teaches a bound shortcut when present", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: "unknown",
        shortcutKey: "Mod+K",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent("Press");
  });

  it("uses showcase copy while practice mode is active", () => {
    act(() => {
      shortcutShowcaseActions.startFromWelcome();
    });
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({ actionId: "unknown" });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Follow the keys on screen.",
    );
  });

  it("teaches the assigned event-jump key when present", () => {
    render(<PointerHint />);

    act(() => {
      eventJumpActions.setPointerHint({ eventId: "event-1", key: "W2" });
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.eventOpen,
        eventId: "event-1",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press W2, then Enter to open this event.",
    );
  });

  it("teaches the event-jump key when no sequence is assigned yet", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.eventOpen,
        eventId: "event-1",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      `Press ${KEYMAP.eventJump.keycaps.join("")} to reveal event shortcuts.`,
    );
  });

  it("names the quarter-hour an empty timed-grid click aimed at", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: "grid.timed",
        gridDate: "2026-08-29",
        gridTimeKey: "1130",
        gridTimeLabel: "11:30 AM",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Type 1130 to create an event at 11:30 AM.",
    );
  });

  it("names an evening quarter-hour in 24-hour digits", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: "grid.timed",
        gridDate: "2026-08-29",
        gridTimeKey: "1830",
        gridTimeLabel: "6:30 PM",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Type 1830 to create an event at 6:30 PM.",
    );
  });

  it("teaches Shift+C for a click on the all-day row", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: "grid.all-day",
        gridDate: "2026-08-29",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Press Shift+C to create an all-day event here.",
    );
  });

  it("tells a working control's key for next time", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: "unknown",
        shortcutKey: ["Mod", "K"],
        performed: true,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      /^Next time, press .+\.$/,
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Press Mod");
  });

  it("names the view keys after the view switcher is clicked", () => {
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({
        actionId: POINTER_ACTIONS.switchView,
        performed: true,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Next time, press W, D, or L to switch views.",
    );
  });

  it("turns tips off from the hint control", async () => {
    const user = userEvent.setup();
    render(<PointerHint />);

    act(() => {
      pointerHintActions.pulse({ actionId: "unknown" });
    });

    await user.click(
      screen.getByRole("button", { name: "Turn off keyboard tips" }),
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(readPointerHintDismissedPermanently()).toBe(true);
  });
});
