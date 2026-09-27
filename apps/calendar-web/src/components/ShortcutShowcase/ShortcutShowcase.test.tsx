import { resolveModifier } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dispatchMissingKey } from "@web/__tests__/utils/keyboard.test.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { RUN_TASKS } from "@web/components/ShortcutShowcase/game.tasks";
import { ShortcutShowcase } from "@web/components/ShortcutShowcase/ShortcutShowcase";
import {
  initialShortcutShowcaseState,
  shortcutShowcaseActions,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { clearAppLockReasons, isAppLocked } from "@web/shortcuts/app-lock";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const pressKey = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
};

const releaseKey = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keyup", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
};

const modInit = () =>
  resolveModifier("Mod") === "Meta" ? { metaKey: true } : { ctrlKey: true };

const typeDigits = (digits: string) => {
  for (const digit of digits) pressKey(digit);
};

/** Hold a bare Control long enough for the page-jump reveal to fire. */
const holdModForReveal = async () => {
  pressKey("Control", { ctrlKey: true });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
};

/** Starts an untimed run from the how-to card and clears the whole queue. */
const playWinningRun = async () => {
  pressKey("Enter");
  // place-standup
  pressKey("c");
  pressKey("ArrowLeft");
  pressKey("Enter");
  // quicktime-coffee
  typeDigits("930");
  pressKey("Enter");
  // nudge-standup
  pressKey("ArrowDown", { shiftKey: true });
  // resize-one-on-one
  pressKey("Tab");
  pressKey("ArrowUp", { shiftKey: true });
  // delete-gym, undo-gym
  pressKey("Delete");
  pressKey("z", modInit());
  // legend-peek: open the practice legend, Esc closes it
  pressKey("?", { shiftKey: true });
  pressKey("Escape");
  // jump-to-kickoff: reveal jump letters, take the kickoff one
  pressKey("h");
  pressKey("s");
  // page-jump-peek: hold Mod for the reveal, then Mod+1
  await holdModForReveal();
  pressKey("1", { ctrlKey: true });
  releaseKey("Control");
  // palette-peek: open the practice palette, Esc closes it
  pressKey("k", modInit());
  pressKey("Escape");
  // place-party
  pressKey("c");
  pressKey("ArrowDown");
  pressKey("Enter");
};

describe("ShortcutShowcase", () => {
  beforeEach(() => {
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "");
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP);
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_WELCOME, "");
    clearAppLockReasons();
  });

  // Shared singletons: leave nothing active for later suites in the process.
  afterEach(() => {
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
    clearAppLockReasons();
  });

  it("renders nothing until started, then locks the app while up", () => {
    render(<ShortcutShowcase />);
    expect(screen.queryByLabelText("Shortcut practice")).toBeNull();
    expect(isAppLocked()).toBe(false);

    act(() => shortcutShowcaseActions.replay());
    expect(screen.getByLabelText("Shortcut practice")).toBeTruthy();
    expect(isAppLocked()).toBe(true);

    act(() => shortcutShowcaseActions.skip());
    expect(screen.queryByLabelText("Shortcut practice")).toBeNull();
    expect(isAppLocked()).toBe(false);
  });

  it("focuses the first control and keeps Tab inside the takeover", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside calendar</button>
        <ShortcutShowcase />
      </>,
    );
    const outside = screen.getByRole("button", { name: "Outside calendar" });
    outside.focus();

    act(() => shortcutShowcaseActions.replay());

    const first = screen.getByRole("button", { name: "Start practicing" });
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(outside).not.toHaveFocus();
    expect(first).not.toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus();
  });

  it("ignores KeyboardEvents with no key instead of throwing", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());

    expect(() => {
      act(() => {
        dispatchMissingKey("keydown");
      });
    }).not.toThrow();

    expect(screen.getByLabelText("Shortcut practice")).toBeTruthy();
  });

  it("shows the how-to card, and Enter starts an untimed run on task 1", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());

    expect(screen.getByText("Block Party")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start practicing" }),
    ).toBeTruthy();

    // Game keys do nothing before the run starts.
    pressKey("c");
    expect(screen.queryByText(/^Task 1\//)).toBeNull();

    pressKey("Enter");
    expect(screen.getByText(`Task 1/${RUN_TASKS.length}`)).toBeTruthy();
    expect(screen.getByText("Standup")).toBeTruthy();
    // The first run is practice: no countdown anywhere.
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("Practice")).toBeTruthy();
  });

  it("offers no timed start from the how-to card", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());

    // The clock is only offered on the end screen, after a practice run.
    expect(screen.queryByRole("button", { name: /Race the clock/ })).toBeNull();
    pressKey("t");
    expect(screen.queryByText(/^Task 1\//)).toBeNull();
  });

  it("swaps the task card's chips as the move unfolds", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    pressKey("Enter");

    // Esc-skip to the jump task. With every board task skipped, letters run
    // over the three seed events alone, so kickoff's chip is A here.
    for (let i = 0; i < 7; i += 1) pressKey("Escape");
    expect(screen.getByText("Fly across the board")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    pressKey("h");
    // The chips on the blocks join the one already on the card.
    expect(screen.getAllByText("A").length).toBe(2);

    // Skip past the jump and page-jump tasks to reach the palette task:
    // its Mod+K hint becomes Esc once the palette opens.
    pressKey("Escape");
    pressKey("Escape");
    expect(screen.getByText("One palette, every command")).toBeTruthy();
    expect(screen.getByText("K")).toBeTruthy();
    pressKey("k", modInit());
    expect(screen.queryByText("K")).toBeNull();
    expect(screen.getAllByText("Esc").length).toBe(2);
  });

  it("clears the queue with the taught keys and reaches the end screen", async () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());

    await playWinningRun();

    expect(screen.getByText("You cleared the week!")).toBeTruthy();
    expect(
      screen.getByText(`${RUN_TASKS.length}/${RUN_TASKS.length} tasks cleared`),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Sign up to keep your calendar/ }),
    ).toBeTruthy();
    // The run finished, but nothing is marked seen until the user leaves.
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
  });

  it("graduates from the end screen and fades out before unmounting", async () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    await playWinningRun();

    // O opens the calendar for anonymous players (Enter belongs to signup).
    pressKey("o");
    expect(screen.getByLabelText("Shortcut practice")).toHaveAttribute(
      "data-closing",
    );
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).toBe("true");

    await waitFor(
      () => {
        expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
      },
      { timeout: 2000 },
    );
    expect(screen.queryByLabelText("Shortcut practice")).toBeNull();
  });

  it("graduates immediately when reduced motion is preferred", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;

    try {
      render(<ShortcutShowcase />);
      act(() => shortcutShowcaseActions.replay());
      await playWinningRun();
      pressKey("o");
      await waitFor(() => {
        expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
      });
      expect(screen.queryByLabelText("Shortcut practice")).toBeNull();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("Enter on the end screen hands an anonymous player to signup", async () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    await playWinningRun();

    pressKey("Enter");
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).toBe("true");
  });

  it("offers a timed rematch from the end screen with a fresh board", async () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    await playWinningRun();
    expect(screen.getByText("You cleared the week!")).toBeTruthy();
    // After an untimed run the replay slot is the timed challenge.
    expect(screen.getByRole("button", { name: /Race the clock/ })).toBeTruthy();

    pressKey("p");
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.getByText(`Task 1/${RUN_TASKS.length}`)).toBeTruthy();
    expect(
      screen.getByText("0", { selector: "[data-game-score]" }),
    ).toBeTruthy();
  });

  it("does not treat S as skip-to-signup; U leaves for signup mid-run", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    pressKey("Enter");

    pressKey("s");
    pressKey("d");
    pressKey("x");
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);

    pressKey("u");
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
  });

  it("on the how-to card, Escape arms a confirm and a second Escape leaves", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());

    pressKey("Escape");
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
    expect(useShortcutShowcaseStore.getState().skipPending).toBe(true);
    expect(screen.getByText("Press Esc again to leave practice.")).toBeTruthy();

    pressKey("Escape");
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
  });

  it("Escape mid-run skips the current task, never the game", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    pressKey("Enter");
    expect(screen.getByText(`Task 1/${RUN_TASKS.length}`)).toBeTruthy();

    pressKey("Escape");
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
    expect(useShortcutShowcaseStore.getState().skipPending).toBe(false);
    expect(screen.getByText(`Task 2/${RUN_TASKS.length}`)).toBeTruthy();
  });

  it("Escape closes an open practice overlay before it skips anything", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    pressKey("Enter");
    // Esc through the board tasks until the legend task is up.
    for (let i = 0; i < 6; i += 1) pressKey("Escape");
    expect(screen.getByText("Blanking on a move?")).toBeTruthy();

    pressKey("?", { shiftKey: true });
    expect(screen.getByText("Shortcuts")).toBeTruthy();

    // Esc closes the legend; closing it is the lesson, so the task clears.
    pressKey("Escape");
    expect(screen.queryByText("Shortcuts")).toBeNull();
    expect(screen.getByText("Fly across the board")).toBeTruthy();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
  });

  it("Escape leaves from the end screen once the run is over", async () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    await playWinningRun();

    pressKey("Escape");
    expect(screen.getByLabelText("Shortcut practice")).toHaveAttribute(
      "data-closing",
    );
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).toBe("true");
  });

  it("the Leave button needs two clicks; a game keystroke cancels the first", async () => {
    const user = userEvent.setup();
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    pressKey("Enter");

    await user.click(screen.getByRole("button", { name: "Leave practice" }));
    expect(useShortcutShowcaseStore.getState().skipPending).toBe(true);
    expect(screen.getByText("Click Leave now to confirm.")).toBeTruthy();

    pressKey("c");
    expect(useShortcutShowcaseStore.getState().skipPending).toBe(false);
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);

    await user.click(screen.getByRole("button", { name: "Leave practice" }));
    await user.click(screen.getByRole("button", { name: "Leave now" }));
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
  });

  it("claims the real palette and legend keys; sims open only on their tasks", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    pressKey("Enter");

    pressKey("k", modInit());
    pressKey("?", { shiftKey: true });
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
    // Task 1 teaches placing, so neither key opens a practice overlay.
    expect(screen.queryByText("Shortcuts")).toBeNull();
    expect(screen.queryByText("Type a command...")).toBeNull();
    expect(screen.getByText(`Task 1/${RUN_TASKS.length}`)).toBeTruthy();
  });

  it("re-offers an unfinished attempt from the how-to card after reload", () => {
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_WELCOME, "true");
    // Legacy lesson step ids from before the game shipped count too.
    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP,
      "eventJump",
    );

    render(<ShortcutShowcase />);

    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
    expect(
      screen.getByRole("button", { name: "Start practicing" }),
    ).toBeTruthy();
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).not.toBe("true");
  });

  it("places the practice sidebar after the grid, matching the real calendar", () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());

    const monday = screen.getByText("Mon");
    const upNext = screen.getByText("Up next", { selector: "div" });
    expect(
      monday.compareDocumentPosition(upNext) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("never offers a reminders button on the end screen", async () => {
    render(<ShortcutShowcase />);
    act(() => shortcutShowcaseActions.replay());
    await playWinningRun();

    expect(
      screen.queryByRole("button", { name: /Enable reminders/ }),
    ).toBeNull();
  });
});
