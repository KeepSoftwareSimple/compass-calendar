import { RouterProvider } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realShortcuthint from "@web/components/Shortcuts/ShortcutHint";
import "@testing-library/jest-dom";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  focusPageJumpTarget,
  PAGE_JUMP_ATTRIBUTE,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockNavigate = mock();
// Snapshotted into a plain object (not just holding the namespace
// reference) because mock.module mutates the live module object in place -
// without the copy, `actualTanstackRouter.useNavigate` below would end up
// pointing at the mock itself once registered.
const actualTanstackRouter = { ...(await import("@tanstack/react-router")) };

// mock.module replaces the module for the whole test process, not just this
// file and isn't reliably "restorable" afterward (other files' top-level
// dynamic imports can race with this file's afterAll). So the factory checks
// a flag on every call instead of freezing the mock in at registration time -
// once the flag flips off, callers anywhere in the process get the real hook.
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

mockModuleForFile("@web/components/Shortcuts/ShortcutHint", realShortcuthint, {
  ShortcutHint: ({ children }: { children: ReactNode }) => (
    <span aria-hidden data-testid="shortcut-hint">
      {children}
    </span>
  ),
});

const { SelectView } = await import("./SelectView");

describe("SelectView", () => {
  let onToday: ReturnType<typeof mock>;

  beforeEach(() => {
    mockNavigate.mockClear();
    onToday = mock();
  });

  const renderWithRouter = async (
    label: string,
    initialRoute: string = ROOT_ROUTES.WEEK,
    includeToday = true,
  ) => {
    const router = createTestRouter(
      <SelectView label={label} onToday={includeToday ? onToday : undefined} />,
      { initialEntries: [initialRoute] },
    );
    const result = render(<RouterProvider router={router} />);

    // TanStack's RouterProvider resolves the initial match asynchronously
    // (even with no loaders), unlike react-router-dom's synchronous
    // MemoryRouter, so tests must wait for it to settle before querying.
    await waitFor(() => {
      expect(router.state.status).toBe("idle");
    });

    return result;
  };

  async function openDropdown() {
    const user = userEvent.setup();
    const button = screen.getByRole("button");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("view-select-dropdown")).toBeInTheDocument();
    });

    return { button, user };
  }

  describe("Component Rendering", () => {
    it("renders the button with the date label", async () => {
      await renderWithRouter("July 2026", ROOT_ROUTES.WEEK);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button.textContent).toBe("July 2026");
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("renders the label as the page heading", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      expect(
        screen.getByRole("heading", { name: "Monday, July 20" }),
      ).toBeInTheDocument();
    });

    it("orders This Week, Day, Week, and Life options with shortcut hints", async () => {
      await renderWithRouter("July 2026");

      await openDropdown();

      const dropdown = screen.getByTestId("view-select-dropdown");
      const withinDropdown = within(dropdown);

      expect(
        withinDropdown
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["This WeekT", "DayD", "WeekW", "LifeL"]);

      const shortcutHints = withinDropdown.getAllByTestId("shortcut-hint");
      expect(shortcutHints).toHaveLength(4);
      expect(shortcutHints[0]).toHaveTextContent("T");
      expect(shortcutHints[1]).toHaveTextContent("D");
      expect(shortcutHints[2]).toHaveTextContent("W");
      expect(shortcutHints[3]).toHaveTextContent("L");
      expect(
        withinDropdown.getByRole("option", { name: /^week/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Route Detection", () => {
    it("marks Day selected when on /day route", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      await openDropdown();

      expect(screen.getByRole("option", { name: /^day/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("option", { name: /^week/i })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("marks Day selected when on /day/:date route", async () => {
      await renderWithRouter(
        "Monday, January 15",
        `${ROOT_ROUTES.DAY}/2024-01-15`,
      );

      await openDropdown();

      expect(screen.getByRole("option", { name: /^day/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("marks Week selected when on /week route", async () => {
      await renderWithRouter("July 2026", ROOT_ROUTES.WEEK);

      await openDropdown();

      expect(screen.getByRole("option", { name: /^week/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("option", { name: /^day/i })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("shows Day, Week, and Life choices from the Life header", async () => {
      await renderWithRouter("Life", ROOT_ROUTES.LIFE, false);

      await openDropdown();

      expect(
        within(screen.getByTestId("view-select-dropdown"))
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["DayD", "WeekW", "LifeL"]);
    });

    it("defaults to Week selected for unknown routes", async () => {
      await renderWithRouter("July 2026", "/unknown-route");

      await openDropdown();

      expect(screen.getByRole("option", { name: /^week/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  describe("Dropdown Behavior", () => {
    it("opens dropdown when button is clicked", async () => {
      await renderWithRouter("July 2026");

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-expanded", "false");

      await openDropdown();

      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("option", { name: /^day/i })).toBeInTheDocument();
    });

    it("closes dropdown when clicking outside", async () => {
      await renderWithRouter("July 2026");

      const { button, user } = await openDropdown();

      await user.click(document.body);

      await waitFor(() => {
        expect(
          screen.queryByTestId("view-select-dropdown"),
        ).not.toBeInTheDocument();
        expect(button).toHaveAttribute("aria-expanded", "false");
      });
    });

    it("closes dropdown when ESC key is pressed", async () => {
      await renderWithRouter("July 2026");

      const { button, user } = await openDropdown();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(
          screen.queryByTestId("view-select-dropdown"),
        ).not.toBeInTheDocument();
        expect(button).toHaveAttribute("aria-expanded", "false");
      });
    });

    it("highlights active view option in dropdown", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      expect(dayOption).toHaveAttribute("aria-selected", "true");

      const weekOption = screen.getByRole("option", { name: /^week/i });
      expect(weekOption).toHaveAttribute("aria-selected", "false");
    });

    it("never marks the This Week/Today action as selected", async () => {
      await renderWithRouter("July 2026", ROOT_ROUTES.WEEK);

      await openDropdown();

      expect(
        screen.getByRole("option", { name: /this week/i }),
      ).toHaveAttribute("aria-selected", "false");
    });

    it("uses div elements for options instead of buttons", async () => {
      await renderWithRouter("July 2026");

      await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      expect(dayOption.tagName).toBe("DIV");
      expect(dayOption.tagName).not.toBe("BUTTON");
    });
  });

  describe("User Interactions", () => {
    it("navigates to Day route when Day option is clicked", async () => {
      await renderWithRouter("July 2026");

      const { user } = await openDropdown();

      const dropdown = screen.getByTestId("view-select-dropdown");
      const withinDropdown = within(dropdown);
      const dayOption = withinDropdown.getByRole("option", { name: /^day/i });
      await user.click(dayOption);

      expect(mockNavigate).toHaveBeenCalledWith({ to: ROOT_ROUTES.DAY });
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it("navigates to Week route when Week option is clicked", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      const { user } = await openDropdown();

      const dropdown = screen.getByTestId("view-select-dropdown");
      const withinDropdown = within(dropdown);
      const weekOption = withinDropdown.getByRole("option", { name: /^week/i });
      await user.click(weekOption);

      expect(mockNavigate).toHaveBeenCalledWith({ to: ROOT_ROUTES.WEEK });
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it("closes dropdown after option selection", async () => {
      await renderWithRouter("July 2026");

      const { button, user } = await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      await user.click(dayOption);

      await waitFor(() => {
        expect(
          screen.queryByTestId("view-select-dropdown"),
        ).not.toBeInTheDocument();
        expect(button).toHaveAttribute("aria-expanded", "false");
      });
    });

    it("labels the today action 'This Week' and calls onToday on the week view", async () => {
      await renderWithRouter("July 2026", ROOT_ROUTES.WEEK);

      const { user, button } = await openDropdown();

      const todayOption = screen.getByRole("option", { name: /this week/i });
      await user.click(todayOption);

      expect(onToday).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(
          screen.queryByTestId("view-select-dropdown"),
        ).not.toBeInTheDocument();
        expect(button).toHaveAttribute("aria-expanded", "false");
      });
    });

    it("labels the today action 'Today' and calls onToday on the day view", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      const { user } = await openDropdown();

      const todayOption = screen.getByRole("option", { name: /^today/i });
      await user.click(todayOption);

      expect(onToday).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Shortcut Hints", () => {
    it("displays d shortcut hint for Day option", async () => {
      await renderWithRouter("July 2026");

      await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      const shortcutHint = dayOption.querySelector(
        '[data-testid="shortcut-hint"]',
      );
      expect(shortcutHint).toHaveTextContent("D");
    });

    it("displays w shortcut hint for Week option", async () => {
      await renderWithRouter("July 2026");

      await openDropdown();

      const weekOption = screen.getByRole("option", { name: /^week/i });
      const shortcutHint = weekOption.querySelector(
        '[data-testid="shortcut-hint"]',
      );
      expect(shortcutHint).toHaveTextContent("W");
    });

    it("displays t shortcut hint for the today action", async () => {
      await renderWithRouter("July 2026");

      await openDropdown();

      const todayOption = screen.getByRole("option", { name: /this week/i });
      const shortcutHint = todayOption.querySelector(
        '[data-testid="shortcut-hint"]',
      );
      expect(shortcutHint).toHaveTextContent("T");
    });
  });

  describe("Keyboard Navigation", () => {
    it("navigates to next option with ArrowDown", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      const { user } = await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      dayOption.focus();

      await user.keyboard("{ArrowDown}");

      await waitFor(() => {
        const weekOption = screen.getByRole("option", { name: /^week/i });
        expect(weekOption).toHaveAttribute("tabindex", "0");
        expect(dayOption).toHaveAttribute("tabindex", "-1");
      });
    });

    it("navigates to previous option with ArrowUp", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      const { user } = await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      dayOption.focus();

      await user.keyboard("{ArrowUp}");

      await waitFor(() => {
        const todayOption = screen.getByRole("option", { name: /^today/i });
        expect(todayOption).toHaveAttribute("tabindex", "0");
        expect(dayOption).toHaveAttribute("tabindex", "-1");
      });
    });

    it("selects highlighted option with Enter key", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      const { user } = await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      dayOption.focus();

      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: ROOT_ROUTES.WEEK });
      });
    });

    it("selects highlighted option with Space key", async () => {
      await renderWithRouter("July 2026", ROOT_ROUTES.WEEK);

      const { user } = await openDropdown();

      const weekOption = screen.getByRole("option", { name: /^week/i });
      weekOption.focus();

      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard(" ");

      await waitFor(() => {
        expect(onToday).toHaveBeenCalledTimes(1);
      });
    });

    it("initializes highlight to current view when dropdown opens", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      const { user } = await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      dayOption.focus();

      expect(dayOption).toHaveAttribute("aria-selected", "true");

      await user.keyboard("{ArrowDown}");

      await waitFor(() => {
        const weekOption = screen.getByRole("option", { name: /^week/i });
        expect(weekOption).toHaveAttribute("tabindex", "0");
        expect(dayOption).toHaveAttribute("tabindex", "-1");
      });
    });

    it("moves from Today to Day", async () => {
      await renderWithRouter("July 2026", ROOT_ROUTES.WEEK);

      const { user } = await openDropdown();

      const todayOption = screen.getByRole("option", { name: /this week/i });
      todayOption.focus();

      await user.keyboard("{ArrowDown}");

      await waitFor(() => {
        const dayOption = screen.getByRole("option", { name: /^day/i });
        expect(dayOption).toHaveAttribute("tabindex", "0");
        expect(todayOption).toHaveAttribute("tabindex", "-1");
      });
    });

    it("wraps navigation from first to last option", async () => {
      await renderWithRouter("Monday, July 20", ROOT_ROUTES.DAY);

      const { user } = await openDropdown();

      const dayOption = screen.getByRole("option", { name: /^day/i });
      dayOption.focus();

      await user.keyboard("{ArrowUp}");

      await waitFor(() => {
        const todayOption = screen.getByRole("option", { name: /^today/i });
        expect(todayOption).toHaveAttribute("tabindex", "0");
        expect(dayOption).toHaveAttribute("tabindex", "-1");
      });
    });
  });

  describe("Page jump", () => {
    it("marks the heading as the view-select jump target", async () => {
      await renderWithRouter("July 2026");

      const button = screen.getByRole("button");
      expect(button.closest(`[${PAGE_JUMP_ATTRIBUTE}]`)).toHaveAttribute(
        PAGE_JUMP_ATTRIBUTE,
        "view-select",
      );
    });

    it("opens the dropdown when the page-jump target is activated", async () => {
      await renderWithRouter("July 2026");

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-expanded", "false");

      act(() => {
        focusPageJumpTarget("view-select");
      });

      await waitFor(() => {
        expect(screen.getByTestId("view-select-dropdown")).toBeInTheDocument();
        expect(button).toHaveAttribute("aria-expanded", "true");
      });
      expect(screen.getByRole("option", { name: /^day/i })).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /^week/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /^life/i }),
      ).toBeInTheDocument();
    });
  });
});
