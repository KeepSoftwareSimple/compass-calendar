import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { getPublicShortcutCatalog } from "@web/shortcuts/shortcuts.registry";
import {
  NotFoundView,
  SHORTCUTS_PAGE_DESCRIPTION,
  SHORTCUTS_PAGE_TITLE,
} from "@web/views/NotFound/NotFound";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("public /shortcuts page", () => {
  let meta: HTMLMetaElement;

  beforeEach(() => {
    window.history.pushState({}, "", ROOT_ROUTES.SHORTCUTS);
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "default description");
    document.head.appendChild(meta);
    document.title = "Compass Calendar";
  });

  afterEach(() => {
    meta.remove();
    document.title = "";
  });

  it("renders Week legend sections plus form, Day-only, and Life-only rows", () => {
    render(<NotFoundView />);

    expect(
      screen.getByRole("heading", { level: 1, name: SHORTCUTS_PAGE_TITLE }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Navigate" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Other" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "While the event form is open" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Day only" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Life only" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Create timed event")).toBeInTheDocument();
    expect(screen.getByText("Save event form")).toBeInTheDocument();
    expect(screen.getByText("Go to Week view")).toBeInTheDocument();
    expect(screen.getByText("Previous life variation")).toBeInTheDocument();

    for (const section of getPublicShortcutCatalog()) {
      expect(
        screen.getByRole("heading", { name: section.title }),
      ).toBeInTheDocument();
      for (const shortcut of section.shortcuts) {
        expect(screen.getByText(shortcut.label)).toBeInTheDocument();
      }
    }
  });

  it("sets the document title and meta description, then restores them", () => {
    const { unmount } = render(<NotFoundView />);

    expect(document.title).toBe(SHORTCUTS_PAGE_TITLE);
    expect(meta.getAttribute("content")).toBe(SHORTCUTS_PAGE_DESCRIPTION);

    unmount();

    expect(document.title).toBe("Compass Calendar");
    expect(meta.getAttribute("content")).toBe("default description");
  });

  it("is a printable public page with a Print action", async () => {
    const print = mock(() => {});
    const originalPrint = window.print;
    window.print = print;

    try {
      const user = userEvent.setup();
      render(<NotFoundView />);

      expect(
        screen.getByRole("link", { name: "Compass Calendar" }),
      ).toHaveAttribute("href", ROOT_ROUTES.ROOT);

      await user.click(screen.getByRole("button", { name: "Print" }));
      expect(print).toHaveBeenCalledTimes(1);
    } finally {
      window.print = originalPrint;
    }
  });

  it("still shows the unmatched-path copy off /shortcuts", () => {
    window.history.pushState({}, "", "/nope");
    render(<NotFoundView />);

    expect(
      screen.getByText(/This isn't part of the app, matey/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: SHORTCUTS_PAGE_TITLE }),
    ).not.toBeInTheDocument();
  });
});
