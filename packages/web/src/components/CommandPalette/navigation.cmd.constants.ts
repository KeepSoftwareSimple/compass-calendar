import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { ArrowUDownLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowUDownLeft";
import { CalendarDotsIcon } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { CalendarIcon } from "@phosphor-icons/react/dist/csr/Calendar";
import { CompassIcon } from "@phosphor-icons/react/dist/csr/Compass";
import { HourglassSimpleIcon } from "@phosphor-icons/react/dist/csr/HourglassSimple";
import { KeyboardIcon } from "@phosphor-icons/react/dist/csr/Keyboard";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import {
  LIFE_SHORTCUT,
  VIEW_SHORTCUTS,
  type ViewName,
} from "@web/shortcuts/shortcuts.constants";

export type CommandPaletteViewName = ViewName;

interface GetNavigationCommandItemsArgs {
  currentView?: CommandPaletteViewName;
  onGoToToday?: () => void;
  onNavigateToView: (viewName: CommandPaletteViewName) => void;
  onShowShortcuts?: () => void;
  onPracticeShortcuts?: () => void;
  onShowWelcomeGuide?: () => void;
}

const commandPaletteViews: Record<
  CommandPaletteViewName,
  {
    icon: Icon;
    label: string;
    route: string;
    shortcut?: string;
    keywords: string[];
  }
> = {
  day: {
    icon: CalendarDotsIcon,
    label: VIEW_SHORTCUTS.day.label,
    route: VIEW_SHORTCUTS.day.route,
    shortcut: VIEW_SHORTCUTS.day.key,
    keywords: ["day view", "day page", "daily", "calendar"],
  },
  week: {
    icon: CalendarIcon,
    label: VIEW_SHORTCUTS.week.label,
    route: VIEW_SHORTCUTS.week.route,
    shortcut: VIEW_SHORTCUTS.week.key,
    keywords: ["week view", "week page", "weekly", "calendar"],
  },
  life: {
    icon: HourglassSimpleIcon,
    label: LIFE_SHORTCUT.label,
    route: LIFE_SHORTCUT.route,
    shortcut: LIFE_SHORTCUT.key,
    keywords: ["life view", "life page", "years", "map"],
  },
};

const navigationViewOrder: CommandPaletteViewName[] = ["day", "week", "life"];

export const getNavigationViewRoute = (viewName: CommandPaletteViewName) =>
  commandPaletteViews[viewName].route;

export const getNavigationCommandItems = ({
  currentView,
  onGoToToday,
  onNavigateToView,
  onShowShortcuts,
  onPracticeShortcuts,
  onShowWelcomeGuide,
}: GetNavigationCommandItemsArgs): CommandItem[] => {
  const calendarItems: CommandItem[] = [];

  if (onGoToToday) {
    calendarItems.push({
      id: "today",
      label: "Go to Today",
      icon: ArrowUDownLeftIcon,
      shortcut: "t",
      keywords: ["now", "current", "jump"],
      onClick: onGoToToday,
    });
  }

  calendarItems.push(
    ...navigationViewOrder
      .filter((viewName) => viewName !== currentView)
      .map((viewName) => {
        const view = commandPaletteViews[viewName];
        return {
          id: `go-to-${viewName}`,
          label: `Go to ${view.label}`,
          icon: view.icon,
          shortcut: view.shortcut,
          keywords: view.keywords,
          onClick: () => onNavigateToView(viewName),
        };
      }),
  );

  if (onShowShortcuts) {
    calendarItems.push({
      id: "show-shortcuts",
      label: "Show shortcuts",
      icon: KeyboardIcon,
      shortcut: "?",
      keywords: [
        "keyboard",
        "keyboard shortcuts",
        "hotkeys",
        "keys",
        "help",
        "keybindings",
      ],
      onClick: onShowShortcuts,
    });
  }

  if (onPracticeShortcuts) {
    calendarItems.push({
      id: "practice-shortcuts",
      label: "Play Block Party (practice shortcuts)",
      icon: CompassIcon,
      keywords: [
        "onboarding",
        "tour",
        "intro",
        "help",
        "tutorial",
        "coach",
        "sandbox",
        "practice",
        "shortcuts",
        "game",
        "play",
        "block party",
      ],
      onClick: onPracticeShortcuts,
    });
  }

  if (onShowWelcomeGuide) {
    calendarItems.push({
      id: "show-welcome-guide",
      label: "Show welcome guide",
      icon: CompassIcon,
      keywords: ["onboarding", "tour", "intro", "help", "faq"],
      onClick: onShowWelcomeGuide,
    });
  }

  return calendarItems;
};
