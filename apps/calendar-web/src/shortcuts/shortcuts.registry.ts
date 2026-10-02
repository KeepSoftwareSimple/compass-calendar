import { type Shortcut } from "@core/shortcuts/shortcut.types";
import {
  SHORTCUTS_REGISTRY,
  type ShortcutRegistryId,
} from "@core/shortcuts/shortcuts.registry";
import { shortcutWhenMatches } from "@web/shortcuts/shortcut-when.util";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";

export { SHORTCUTS_REGISTRY, type ShortcutRegistryId };

interface FilterOptions {
  view: "day" | "week" | "life";
  isViewingCurrentPeriod: boolean;
  isFormOpen?: boolean;
  isTrialing?: boolean;
}

// Context-sensitive display labels, keyed by shortcut id. Each override lives
// here, next to the registry, instead of in a branch chain.
const LABEL_OVERRIDES: Record<string, (options: FilterOptions) => string> = {
  "nav-previous": ({ view }) => `Previous ${view}`,
  "nav-next": ({ view }) => `Next ${view}`,
  "nav-picker-step": ({ view }) =>
    view === "day"
      ? "Move the month picker by a day (Enter opens it)"
      : "Move the month picker by a week (Enter opens it)",
  "nav-today": ({ view, isViewingCurrentPeriod }) => {
    if (isViewingCurrentPeriod) return "Scroll to now";
    return view === "week" ? "Go to current week" : "Go to today";
  },
  "edit-focus-prev": ({ view }) =>
    view === "week" ? "Focus previous event on day" : "Focus previous event",
  "edit-focus-next": ({ view }) =>
    view === "week" ? "Focus next event on day" : "Focus next event",
  "edit-focus-left": ({ view }) =>
    view === "day" ? "Focus previous event" : "Focus event on previous day",
  "edit-focus-right": ({ view }) =>
    view === "day" ? "Focus next event" : "Focus event on next day",
};

/**
 * Filter shortcuts based on context. Returns a new list of shortcuts that should
 * be visible given the current app state, with view-appropriate labels.
 */
export const filterShortcutsByContext = (
  options: FilterOptions,
): Shortcut[] => {
  const { view, isFormOpen, isTrialing } = options;

  const shortcuts: Shortcut[] = SHORTCUTS_REGISTRY.map((shortcut) => ({
    ...shortcut,
    label: LABEL_OVERRIDES[shortcut.id]?.(options) ?? shortcut.label,
  }));

  return shortcuts.filter((shortcut) => {
    // Filter by view
    if (view === "life") {
      // Life view shows only life-specific navigate + other shortcuts, plus
      // the page jump row: Life mounts its own hold-Mod jump targets, so the
      // gesture is still discoverable there.
      if (shortcut.section === "focus") {
        return (
          shortcut.id === "focus-page-jump" ||
          shortcut.id === "focus-find-event" ||
          shortcut.id === "focus-calendar-digit"
        );
      }
      if (shortcut.section === "create" || shortcut.section === "edit") {
        return false;
      }
      // Include navigate shortcuts only if life-specific or view switchers
      if (shortcut.section === "navigate") {
        return (
          shortcut.when?.lifeView === true ||
          shortcut.id === "nav-day-view" ||
          shortcut.id === "nav-week-view"
        );
      }
      if (shortcut.id === "other-time-travel") {
        return false;
      }
    } else {
      // Day/week view excludes life-specific shortcuts
      if (shortcut.when?.lifeView === true) {
        return false;
      }
      if (shortcut.when?.weekView === true && view !== "week") {
        return false;
      }
      // Exclude current view switcher (show only alternate view)
      if (
        (view === "day" && shortcut.id === "nav-day-view") ||
        (view === "week" && shortcut.id === "nav-week-view")
      ) {
        return false;
      }
      // Week view includes shift shortcuts, day view should filter them
      if (
        view === "day" &&
        (shortcut.id === "nav-shift-left" || shortcut.id === "nav-shift-right")
      ) {
        return false;
      }
    }

    // Filter by declarative context predicates
    if (
      !shortcutWhenMatches(shortcut.when, {
        lifeView: view === "life",
        weekView: view === "week",
        isFormOpen,
        isTrialing,
      })
    ) {
      return false;
    }

    return true;
  });
};

const SECTION_TITLES: Record<string, string> = {
  navigate: "Navigate",
  create: "Create",
  focus: "Focus",
  edit: "Edit",
  other: "Other",
};

/**
 * Get shortcuts grouped by section, in display order. Used for the legend
 * overlay.
 */
export const getShortcutsBySection = (
  shortcuts: Shortcut[],
): { id: string; title: string; shortcuts: Shortcut[] }[] =>
  Object.entries(SECTION_TITLES)
    .map(([id, title]) => ({
      id,
      title,
      shortcuts: shortcuts.filter((shortcut) => shortcut.section === id),
    }))
    .filter((section) => section.shortcuts.length > 0);

export type ShortcutMenuView = FilterOptions["view"];

/**
 * Shortcut menu sections for the `?` legend overlay: the registry filtered
 * for the current view/state, grouped by section.
 */
export const getShortcutMenuSections = (
  config: FilterOptions,
): ShortcutOverlaySection[] =>
  getShortcutsBySection(filterShortcutsByContext(config));

const PUBLIC_CATALOG_CONTEXT = {
  isViewingCurrentPeriod: false as const,
};

const shortcutIds = (shortcuts: Shortcut[]): Set<string> =>
  new Set(shortcuts.map((shortcut) => shortcut.id));

/**
 * Printable public catalog: Week legend sections, then form-open rows, then
 * Day-only and Life-only rows. `requiresWrite` rows stay listed: the page
 * describes the product, not the reader's plan.
 */
export const getPublicShortcutCatalog = (): ShortcutOverlaySection[] => {
  const week = getShortcutMenuSections({
    ...PUBLIC_CATALOG_CONTEXT,
    view: "week",
  });
  const weekIds = shortcutIds(week.flatMap((section) => section.shortcuts));

  const formOpen = filterShortcutsByContext({
    ...PUBLIC_CATALOG_CONTEXT,
    view: "week",
    isFormOpen: true,
  }).filter((shortcut) => !weekIds.has(shortcut.id));

  const dayOnly = filterShortcutsByContext({
    ...PUBLIC_CATALOG_CONTEXT,
    view: "day",
  }).filter((shortcut) => !weekIds.has(shortcut.id));
  const dayIds = shortcutIds(dayOnly);

  const lifeOnly = filterShortcutsByContext({
    ...PUBLIC_CATALOG_CONTEXT,
    view: "life",
  }).filter(
    (shortcut) => !weekIds.has(shortcut.id) && !dayIds.has(shortcut.id),
  );

  return [
    ...week,
    ...(formOpen.length > 0
      ? [
          {
            id: "form-open",
            title: "While the event form is open",
            shortcuts: formOpen,
          },
        ]
      : []),
    ...(dayOnly.length > 0
      ? [{ id: "day-only", title: "Day only", shortcuts: dayOnly }]
      : []),
    ...(lifeOnly.length > 0
      ? [{ id: "life-only", title: "Life only", shortcuts: lifeOnly }]
      : []),
  ];
};
