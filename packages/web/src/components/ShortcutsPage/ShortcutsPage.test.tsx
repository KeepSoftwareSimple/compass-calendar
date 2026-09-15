import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  SHORTCUTS_PAGE_DESCRIPTION,
  SHORTCUTS_PAGE_TITLE,
  ShortcutsPage,
} from "./ShortcutsPage";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("ShortcutsPage", () => {
  let meta: HTMLMetaElement;

  beforeEach(() => {
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
    render(<ShortcutsPage />);

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
  });

  it("sets the document title and meta description, then restores them", () => {
    const { unmount } = render(<ShortcutsPage />);

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
      render(<ShortcutsPage />);

      expect(
        screen.getByRole("link", { name: "Compass Calendar" }),
      ).toHaveAttribute("href", ROOT_ROUTES.ROOT);

      await user.click(screen.getByRole("button", { name: "Print" }));
      expect(print).toHaveBeenCalledTimes(1);
    } finally {
      window.print = originalPrint;
    }
  });
});
