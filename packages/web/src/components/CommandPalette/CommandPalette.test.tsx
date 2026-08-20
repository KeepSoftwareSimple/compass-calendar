import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderWithStore } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { onViewCommand } from "@web/common/utils/dom/view-command-bus";
import { type EventMutationDependencies } from "@web/events/mutations/useEventMutations";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import {
  undoHistoryActions,
  useUndoHistoryStore,
} from "@web/events/stores/undo.store";
import {
  selectIsCmdPaletteOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import {
  initialKeyboardOnlyState,
  keyboardOnlyActions,
  useKeyboardOnlyStore,
} from "@web/shortcuts/keyboard-only/keyboard-only.store";
import { useKeyboardOnlyMode } from "@web/shortcuts/keyboard-only/useKeyboardOnlyMode";
import { recordRecentCommand } from "./recent-commands.store";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockNavigate = mock();
// Bun's mock.module is process-wide, so mock the router's useNavigate directly
// rather than relying on a real RouterProvider. Snapshotted into a plain
// object because mock.module mutates the live module object in place, and
// the factory checks a flag on every call (flipped off in afterAll) so files
// running later in the same process get the real hook back - restoring the
// module in afterAll instead would race with other files' top-level imports.
const actualTanstackRouter = { ...(await import("@tanstack/react-router")) };
let isNavigateMocked = true;

mock.module("@tanstack/react-router", () => ({
  ...actualTanstackRouter,
  useNavigate: (...args: unknown[]) =>
    isNavigateMocked
      ? mockNavigate
      : // biome-ignore lint/correctness/useHookAtTopLevel: this is a mock.module factory, not a component - the flag is stable for the lifetime of any given render (it only flips once, in afterAll, after this file's components have unmounted).
        actualTanstackRouter.useNavigate(...(args as [])),
}));

afterAll(() => {
  isNavigateMocked = false;
});

const { CommandPalette, LifeCommandPalette } = await import("./CommandPalette");

const onGoToToday = mock();
const onShowShortcuts = mock();

const renderPalette = (
  mutationDependencies?: EventMutationDependencies,
  currentView: "day" | "week" = "week",
) =>
  renderWithStore(
    <CommandPalette
      currentView={currentView}
      onGoToToday={onGoToToday}
      onShowShortcuts={onShowShortcuts}
      placeholder="Try: 'create', 'bug', or 'code'"
      mutationDependencies={mutationDependencies}
    />,
    { settings: { isCmdPaletteOpen: true } },
  );

const getInput = () =>
  screen.getByLabelText("Command palette search") as HTMLInputElement;

// The active row is the one the component paints with the active token; this
// is driven by our own activeIndex, which is exactly what we want to assert.
// Scoped to the label span (not the row's full textContent) so it isn't
// polluted by the row's keycap chip text (e.g. "Go to DayD").
const activeRowText = (container: HTMLElement) =>
  container.ownerDocument.querySelector(".bg-surface-overlay > span")
    ?.textContent ?? null;

// Match highlighting splits a matched label into text + <strong> nodes, so
// testing-library's default getByText(string) (which only looks at an
// element's own direct text-node children, not nested descendants) stops
// matching the label span once part of it is highlighted. This checks full
// recursive textContent instead, scoped to the label span specifically
// (the row's `<button>` has the same full text and would otherwise also match).
const rowLabel = (label: string) =>
  screen.getByText(
    (_content, element) =>
      element?.tagName === "SPAN" && element?.textContent === label,
  );

const isOpen = () => selectIsCmdPaletteOpen(useSettingsStore.getState());

describe("CommandPalette", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    onGoToToday.mockClear();
    onShowShortcuts.mockClear();
    useKeyboardOnlyStore.setState(initialKeyboardOnlyState);
  });

  it("renders all sections with items and focuses the input on mount", () => {
    const { container } = renderPalette();

    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Common Actions")).toBeInTheDocument();
    // Only the heading matches here: useShowAccountsCmdItems' "Manage
    // Accounts" item is gated on auth, and this render is unauthenticated
    // (no SessionContext.Provider — see session.context.ts's default).
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();

    // Navigation always lists Today first, then app views.
    expect(screen.getByText("Go to Today")).toBeInTheDocument();
    expect(screen.getByText("Go to Day")).toBeInTheDocument();
    expect(screen.queryByText("Go to Week")).not.toBeInTheDocument();
    expect(screen.getByText("Go to Life")).toBeInTheDocument();
    expect(screen.getByText("Create event")).toBeInTheDocument();
    expect(screen.getByText("Create all-day event")).toBeInTheDocument();
    expect(screen.getByText(/Change default timezone/)).toBeInTheDocument();
    expect(screen.getByText("Time travel")).toBeInTheDocument();
    expect(getInput()).toHaveFocus();
    // First option is active by default.
    expect(activeRowText(container)).toBe("Go to Today");
  });

  it("renders the Day and Week navigation shortcut tips", () => {
    const { unmount } = renderPalette();
    const dayRow = screen.getByText("Go to Day").closest("button");

    expect(dayRow?.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "D",
    );

    unmount();
    renderPalette(undefined, "day");
    const weekRow = screen.getByText("Go to Week").closest("button");

    expect(weekRow?.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "W",
    );
  });

  it("fuzzy-filters case-insensitively, dropping empty sections, and shows a no-results row", () => {
    const { container } = renderPalette();

    fireEvent.change(getInput(), { target: { value: "create event" } });

    // Both create items match ("event" is a word-prefix hit on each label);
    // "Create event" ranks first (tie broken by authored order). Matched
    // text is now bolded, so query by full recursive textContent (rowLabel)
    // rather than the default getByText, which only reads direct children.
    expect(rowLabel("Create event")).toBeInTheDocument();
    expect(rowLabel("Create all-day event")).toBeInTheDocument();
    expect(activeRowText(container)).toBe("Create event");
    expect(screen.queryByText("Navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Connect Google Calendar"),
    ).not.toBeInTheDocument();

    fireEvent.change(getInput(), { target: { value: "zzzzz" } });
    // The sr-only live region echoes the same "No results for" copy, so
    // scope to the visible div specifically to avoid an ambiguous match.
    expect(
      screen.getByText(/No results for/, { selector: "div" }),
    ).toBeInTheDocument();
  });

  it("matches a synonym keyword that doesn't appear in the label", () => {
    const { container } = renderPalette();

    fireEvent.change(getInput(), { target: { value: "day page" } });

    expect(rowLabel("Go to Day")).toBeInTheDocument();
    expect(activeRowText(container)).toBe("Go to Day");
  });

  it("moves the active option with arrows, wraps, and skips disabled items", () => {
    const { container } = renderPalette();
    const input = getInput();

    // The Undo row renders as a disabled button when there's no history.
    expect(
      screen.getByText("Undo last change").closest("button"),
    ).toBeDisabled();

    // First option active by default; ArrowUp wraps to the last (About) row.
    expect(activeRowText(container)).toBe("Go to Today");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeRowText(container)).toBe("About Compass");
    // ArrowDown from the last option wraps back to the first.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeRowText(container)).toBe("Go to Today");

    // Walk down to "Create all-day event", then the next ArrowDown skips the
    // disabled Undo row and lands on the Appearance section's theme toggle.
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Go to Day
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Go to Life
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Show shortcuts
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Toggle keyboard-only mode
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Practice shortcuts
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Create event
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Create all-day event
    expect(activeRowText(container)).toBe("Create all-day event");
    fireEvent.keyDown(input, { key: "ArrowDown" }); // skips Undo last change
    expect(activeRowText(container)).toBe("Switch to light theme");
  });

  it("runs the active item's onClick and closes on Enter", async () => {
    const onCreateTimedDraft = mock();
    const unsubscribe = onViewCommand("CREATE_TIMED_DRAFT", onCreateTimedDraft);
    renderPalette();
    const input = getInput();

    // Both create items score equally for this query; "Create event" ranks
    // first (and active) as the tie-break keeps the authored order.
    fireEvent.change(input, { target: { value: "Create event" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The click defers the emit to a microtask so the palette can unmount first.
    await waitFor(() => {
      expect(onCreateTimedDraft).toHaveBeenCalledTimes(1);
    });
    expect(isOpen()).toBe(false);
    unsubscribe();
  });

  it("runs Enter selection while keyboard-only mode blocks clicks", () => {
    // Mount the same capture-phase click blocker RootShell uses in production.
    const { unmount: unmountMode } = renderHook(() => useKeyboardOnlyMode());

    act(() => {
      keyboardOnlyActions.enter();
    });
    expect(useKeyboardOnlyStore.getState().isActive).toBe(true);

    renderPalette();
    const input = getInput();
    fireEvent.change(input, { target: { value: "Show shortcuts" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);

    unmountMode();
  });

  it("resets the active option to the first after typing", () => {
    const { container } = renderPalette();
    const input = getInput();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeRowText(container)).toBe("Go to Day");

    fireEvent.change(input, { target: { value: "go" } });
    expect(activeRowText(container)).toBe("Go to Today");
  });

  it("closes on Escape", () => {
    renderPalette();
    fireEvent.keyDown(getInput(), { key: "Escape" });
    expect(isOpen()).toBe(false);
  });

  it("clears the search query when reopened after close", () => {
    renderPalette();
    const input = getInput();

    fireEvent.change(input, { target: { value: "ligh" } });
    expect(input).toHaveValue("ligh");
    expect(rowLabel("Switch to light theme")).toBeInTheDocument();
    expect(screen.queryByText("Go to Today")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(isOpen()).toBe(false);

    act(() => {
      settingsActions.openCmdPalette();
    });
    expect(isOpen()).toBe(true);
    expect(getInput()).toHaveValue("");
    expect(screen.getByText("Go to Today")).toBeInTheDocument();
  });

  it("closes on outside press", () => {
    renderPalette();
    const overlay = document.querySelector(".backdrop-blur-sm") as HTMLElement;
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    expect(isOpen()).toBe(false);
  });

  it("renders disabled Undo and Redo rows with keycaps when there is no history", () => {
    renderPalette();

    const undoRow = screen.getByText("Undo last change").closest("button");
    expect(undoRow).toBeDisabled();
    // Two keycap chips: the platform modifier and Z (see the aria-hidden
    // note in the Show Shortcuts test below).
    expect(undoRow?.querySelectorAll("[aria-hidden='true']")).toHaveLength(2);

    const redoRow = screen.getByText("Redo last change").closest("button");
    expect(redoRow).toBeDisabled();
    // Mod + Shift + Z → three keycap chips.
    expect(redoRow?.querySelectorAll("[aria-hidden='true']")).toHaveLength(3);
  });

  it("undoes the last change and closes when the Undo row is clicked", async () => {
    const before = createMockEvent({
      content: { kind: "details", title: "Before", description: "" },
    });
    undoHistoryActions.record({
      kind: "edit",
      id: before.id,
      before,
      after: {
        ...before,
        content: { kind: "details", title: "After", description: "" },
      },
    });
    const repository: EventRepository = {
      list: async () => [],
      create: async () => before,
      replace: async (id, input) => ({
        ...before,
        id,
        content: input.content,
        schedule: input.schedule,
      }),
      delete: async () => {},
    };
    renderPalette({
      source: "local",
      repository,
      markWrite: async () => {},
      reportError: () => {},
    });

    const row = screen.getByText("Undo last change").closest("button");
    expect(row).not.toBeDisabled();

    fireEvent.click(row as HTMLButtonElement);

    // The click defers undo to a microtask so the palette can unmount first.
    await waitFor(() => {
      expect(useUndoHistoryStore.getState().past).toHaveLength(0);
      expect(useUndoHistoryStore.getState().future).toHaveLength(1);
    });
    expect(isOpen()).toBe(false);
  });

  it("redoes the last change and closes when the Redo row is clicked", async () => {
    const before = createMockEvent({
      content: { kind: "details", title: "Before", description: "" },
    });
    undoHistoryActions.record({
      kind: "edit",
      id: before.id,
      before,
      after: {
        ...before,
        content: { kind: "details", title: "After", description: "" },
      },
    });
    // Move the edit into the future stack so Redo is enabled.
    undoHistoryActions.commitUndo();
    const repository: EventRepository = {
      list: async () => [],
      create: async () => before,
      replace: async (id, input) => ({
        ...before,
        id,
        content: input.content,
        schedule: input.schedule,
      }),
      delete: async () => {},
    };
    renderPalette({
      source: "local",
      repository,
      markWrite: async () => {},
      reportError: () => {},
    });

    const row = screen.getByText("Redo last change").closest("button");
    expect(row).not.toBeDisabled();

    fireEvent.click(row as HTMLButtonElement);

    await waitFor(() => {
      expect(useUndoHistoryStore.getState().past).toHaveLength(1);
      expect(useUndoHistoryStore.getState().future).toHaveLength(0);
    });
    expect(isOpen()).toBe(false);
  });

  it("renders a keycap chip for the shortcut and runs onShowShortcuts on click", () => {
    renderPalette();

    // `[aria-hidden='true']` (not `.c-keycap`) because SelectView.test.tsx
    // mocks ShortcutHint process-wide (bun's mock.module leaks across
    // files); its stub keeps aria-hidden but drops the real class.
    const row = screen.getByText("Show shortcuts").closest("button");
    expect(row?.querySelector("[aria-hidden='true']")?.textContent).toBe("?");

    fireEvent.click(row as HTMLButtonElement);
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);
  });

  it("keeps Google sync status and actions out of the command palette", () => {
    renderPalette();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Google Calendar|calendar sync|calendar status/i),
    ).not.toBeInTheDocument();
  });

  it("activates a row on pointer move, without requiring a keypress", () => {
    const { container } = renderPalette();
    expect(activeRowText(container)).toBe("Go to Today");

    const dayRow = screen.getByText("Go to Day").closest("button");
    fireEvent.pointerMove(dayRow as HTMLButtonElement);

    expect(activeRowText(container)).toBe("Go to Day");
  });

  it("announces the result count in a live region, matching the visible copy", () => {
    renderPalette();
    const liveRegion = () =>
      document.querySelector('[aria-live="polite"]') as HTMLElement;

    // Nothing announced yet for an untouched, empty query.
    expect(liveRegion().textContent).toBe("");

    fireEvent.change(getInput(), { target: { value: "create event" } });
    expect(liveRegion().textContent).toBe("2 results");

    fireEvent.change(getInput(), { target: { value: "zzzzz" } });
    expect(liveRegion().textContent).toBe("No results for “zzzzz”");
  });

  it("renders keyboard hint footer chips", () => {
    renderPalette();

    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Select")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("shows a Recent section with previously used commands, hidden while typing", () => {
    recordRecentCommand("go-to-day");

    renderPalette();

    const recentHeading = screen.getByText("Recent");
    const recentSection = recentHeading.closest("div.mb-1") as HTMLElement;
    expect(within(recentSection).getByText("Go to Day")).toBeInTheDocument();

    fireEvent.change(getInput(), { target: { value: "day" } });
    expect(screen.queryByText("Recent")).not.toBeInTheDocument();
  });

  it("records a command as recent when it's selected", () => {
    renderPalette();

    fireEvent.click(screen.getByText("Show shortcuts"));
    expect(isOpen()).toBe(false);

    // Same reopen pattern as "clears the search query when reopened after
    // close" — the store flip re-renders CommandPaletteContent in place.
    act(() => {
      settingsActions.openCmdPalette();
    });

    const recentHeading = screen.getByText("Recent");
    const recentSection = recentHeading.closest("div.mb-1") as HTMLElement;
    expect(
      within(recentSection).getByText("Show shortcuts"),
    ).toBeInTheDocument();
  });
});

describe("LifeCommandPalette", () => {
  it("does not render Google sync status", () => {
    renderWithStore(
      <LifeCommandPalette placeholder="Try: 'day', 'week', or 'feedback'" />,
      { settings: { isCmdPaletteOpen: true } },
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Calendar up-to-date")).not.toBeInTheDocument();
  });
});
