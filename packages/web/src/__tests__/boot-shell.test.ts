/**
 * The pre-JavaScript boot shell in `src/index.html` runs before any module
 * loads, so it cannot import the app's constants: it re-spells the storage
 * keys, the sidebar geometry, the breakpoint, the theme colors and the
 * visible-column formula as literals, under a comment asking whoever changes
 * them to keep eight files in sync by hand.
 *
 * This runs the real head script from the real file and compares what it
 * computes against the constants it copied, so a change to either side fails
 * here instead of shifting the layout at the React swap.
 */

import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { SIDEBAR_AUTO_COLLAPSE_BREAKPOINT } from "@web/components/AuthenticatedLayout/responsive.constants";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_DIVIDER_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@web/components/Sidebar/storage/sidebar-width.constants";
import { DEFAULT_THEME, THEMES } from "@web/settings/theme/theme.constants";
import { computeVisibleDayCount } from "@web/views/Week/util/week-window.util";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const INDEX_HTML_PATH = path.join(import.meta.dir, "..", "index.html");
const indexHtml = readFileSync(INDEX_HTML_PATH, "utf8");

/**
 * The two attribute-less inline scripts, in document order: the head script
 * that themes and sizes the shell, then the body script that fills in dates.
 * The structured-data and module scripts both carry attributes.
 */
const inlineScripts = [
  ...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g),
].map((match) => match[1]);
const headScript = inlineScripts[0] ?? "";

/**
 * WeekView's own left padding (`pl-8`). A Tailwind class has no importable
 * value, so this is the one number the guard can only restate.
 */
const MAIN_COLUMN_LEFT_PADDING = 32;

const expectedTrackWidth = (
  innerWidth: number,
  sidebar: { isOpen: boolean; width: number },
): number =>
  innerWidth -
  MAIN_COLUMN_LEFT_PADDING -
  (sidebar.isOpen ? SIDEBAR_DIVIDER_WIDTH + sidebar.width : 0);

/**
 * A fresh document plus a getItem-only storage stub, handed to the script as
 * arguments so its free `document` / `localStorage` / `innerWidth` resolve
 * without touching this process's own globals. Each call gets its own
 * document, so cases cannot leak attributes into each other.
 */
const runHeadScript = ({
  innerWidth,
  stored = {},
}: {
  innerWidth: number;
  stored?: Record<string, string>;
}) => {
  const doc = document.implementation.createHTMLDocument("boot shell");
  doc.documentElement.setAttribute("data-theme", DEFAULT_THEME);
  const meta = doc.createElement("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", THEMES[DEFAULT_THEME].metaColor);
  doc.head.appendChild(meta);

  const storage = {
    getItem: (key: string): string | null => stored[key] ?? null,
  };

  new Function("innerWidth", "document", "localStorage", headScript)(
    innerWidth,
    doc,
    storage,
  );

  const html = doc.documentElement;
  const themeColor = doc.getElementsByName("theme-color")[0];
  return {
    theme: html.getAttribute("data-theme"),
    themeColor: themeColor?.getAttribute("content") ?? null,
    sidebarState: html.dataset.bootSidebar,
    sidebarWidth: html.style.getPropertyValue("--boot-sidebar-width"),
    columns: Number(html.dataset.bootCols),
    columnsVariable: html.style.getPropertyValue("--boot-cols"),
  };
};

describe("boot shell head script: sidebar state", () => {
  it("opens the sidebar at its default width when nothing is stored", () => {
    const shell = runHeadScript({ innerWidth: 1600 });

    expect(shell.sidebarState).toBe("open");
    expect(shell.sidebarWidth).toBe(`${SIDEBAR_DEFAULT_WIDTH}px`);
  });

  it("honors a stored collapsed sidebar", () => {
    const shell = runHeadScript({
      innerWidth: 1600,
      stored: { [STORAGE_KEYS.SIDEBAR_OPEN]: "false" },
    });

    expect(shell.sidebarState).toBe("closed");
  });

  it("collapses below the auto-collapse breakpoint and opens at it", () => {
    expect(
      runHeadScript({ innerWidth: SIDEBAR_AUTO_COLLAPSE_BREAKPOINT - 1 })
        .sidebarState,
    ).toBe("closed");
    expect(
      runHeadScript({ innerWidth: SIDEBAR_AUTO_COLLAPSE_BREAKPOINT })
        .sidebarState,
    ).toBe("open");
  });

  it("clamps a stored width the way clampSidebarWidth does", () => {
    const tooWide = runHeadScript({
      innerWidth: 1600,
      stored: { [STORAGE_KEYS.SIDEBAR_WIDTH]: "9999" },
    });
    const tooNarrow = runHeadScript({
      innerWidth: 1600,
      stored: { [STORAGE_KEYS.SIDEBAR_WIDTH]: "100" },
    });

    expect(tooWide.sidebarWidth).toBe(`${clampSidebarWidth(9999)}px`);
    expect(tooWide.sidebarWidth).toBe(`${SIDEBAR_MAX_WIDTH}px`);
    expect(tooNarrow.sidebarWidth).toBe(`${clampSidebarWidth(100)}px`);
    expect(tooNarrow.sidebarWidth).toBe(`${SIDEBAR_MIN_WIDTH}px`);
  });

  it('reads a stored "0" as the default width, as the file documents', () => {
    // The app clamps 0 up to SIDEBAR_MIN_WIDTH; the shell's `|| 345` fallback
    // treats it as unset instead. Pinned so the divergence stays deliberate.
    const shell = runHeadScript({
      innerWidth: 1600,
      stored: { [STORAGE_KEYS.SIDEBAR_WIDTH]: "0" },
    });

    expect(shell.sidebarWidth).toBe(`${SIDEBAR_DEFAULT_WIDTH}px`);
  });
});

describe("boot shell head script: visible columns", () => {
  const cases: { innerWidth: number; storedWidth?: string }[] = [
    { innerWidth: 1600 },
    { innerWidth: SIDEBAR_AUTO_COLLAPSE_BREAKPOINT },
    { innerWidth: SIDEBAR_AUTO_COLLAPSE_BREAKPOINT - 1 },
    { innerWidth: 1600, storedWidth: String(SIDEBAR_MAX_WIDTH) },
    { innerWidth: 900 },
    { innerWidth: 400 },
    { innerWidth: 100 },
  ];

  for (const { innerWidth, storedWidth } of cases) {
    it(`matches computeVisibleDayCount at ${innerWidth}px${
      storedWidth ? ` with a ${storedWidth}px sidebar` : ""
    }`, () => {
      const shell = runHeadScript({
        innerWidth,
        stored: storedWidth
          ? { [STORAGE_KEYS.SIDEBAR_WIDTH]: storedWidth }
          : {},
      });
      const track = expectedTrackWidth(innerWidth, {
        isOpen: shell.sidebarState === "open",
        width: Number.parseInt(shell.sidebarWidth, 10),
      });

      expect(shell.columns).toBe(computeVisibleDayCount(track));
      expect(shell.columnsVariable).toBe(String(shell.columns));
    });
  }
});

describe("boot shell head script: theme", () => {
  it("applies the stored dark theme and its meta color before first paint", () => {
    const shell = runHeadScript({
      innerWidth: 1600,
      stored: { [STORAGE_KEYS.THEME]: "dark-abyss" },
    });

    expect(shell.theme).toBe("dark-abyss");
    expect(shell.themeColor).toBe(THEMES["dark-abyss"].metaColor);
  });

  it("keeps the default theme when nothing or an unknown value is stored", () => {
    const unset = runHeadScript({ innerWidth: 1600 });
    const unknown = runHeadScript({
      innerWidth: 1600,
      stored: { [STORAGE_KEYS.THEME]: "light-lagoon" },
    });

    for (const shell of [unset, unknown]) {
      expect(shell.theme).toBe(DEFAULT_THEME);
      expect(shell.themeColor).toBe(THEMES[DEFAULT_THEME].metaColor);
    }
  });
});

describe("boot shell markup", () => {
  it("ships the default theme and its meta color as the static attributes", () => {
    expect(indexHtml).toContain(
      `<html lang="en" data-theme="${DEFAULT_THEME}">`,
    );
    expect(indexHtml).toContain(
      `<meta name="theme-color" content="${THEMES[DEFAULT_THEME].metaColor}" />`,
    );
  });

  it("carries both inline scripts the shell needs", () => {
    expect(inlineScripts).toHaveLength(2);
    expect(headScript).toContain("--boot-sidebar-width");
  });
});
