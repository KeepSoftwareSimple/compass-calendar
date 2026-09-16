import {
  ArrowUDownLeftIcon,
  CalendarDotsIcon,
  CalendarIcon,
  CompassIcon,
  HourglassSimpleIcon,
  type Icon,
  KeyboardIcon,
  SidebarSimpleIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { type Dayjs } from "@core/util/date/dayjs";
import {
  goToDatePaletteLabel,
  parseUserDate,
} from "@web/common/utils/datetime/web.date.util";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { withPaletteShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import {
  LIFE_SHORTCUT,
  VIEW_SHORTCUTS,
  type ViewName,
} from "@web/shortcuts/shortcuts.constants";

export const GO_TO_DATE_ITEM_ID = "go-to-date";

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

/** Synthetic palette row while the query parses as a date. Not keyword-filtered. */
export const getGoToDateCommandItem = (
  query: string,
  now: Dayjs,
  onSelect: (date: Dayjs) => void,
): CommandItem | null => {
  const date = parseUserDate(query, now);
  if (!date) return null;

  return {
    id: GO_TO_DATE_ITEM_ID,
    label: goToDatePaletteLabel(date),
    icon: CalendarIcon,
    onClick: () => onSelect(date),
  };
};

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

export interface LegendNavigationCommandOptions {
  isSidebarOpen: boolean;
  hasUpNext: boolean;
  hasConference: boolean;
  onToggleSidebar: () => void;
  onFocusMonthPicker: () => void;
  onOpenUpNext: () => void;
  onJoinMeeting: () => void;
}

/** Legend navigate/other rows that the palette did not list until Keyboard v1. */
export const getLegendNavigationCommandItems = ({
  isSidebarOpen,
  hasUpNext,
  hasConference,
  onToggleSidebar,
  onFocusMonthPicker,
  onOpenUpNext,
  onJoinMeeting,
}: LegendNavigationCommandOptions): CommandItem[] => {
  const B = APP_SHORTCUT_BINDINGS;
  return [
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      icon: SidebarSimpleIcon,
      shortcut: [...B.otherSidebar.keycaps],
      keywords: ["panel", "hide sidebar", "show sidebar"],
      onClick: withPaletteShortcut("other-sidebar", onToggleSidebar),
    },
    {
      id: "focus-month-picker",
      label: "Focus month picker",
      icon: CalendarDotsIcon,
      shortcut: [...B.focusSidebar.keycaps],
      keywords: ["sidebar", "dates", "calendar"],
      disabled: !isSidebarOpen,
      onClick: withPaletteShortcut("focus-sidebar", onFocusMonthPicker),
    },
    {
      id: "open-up-next",
      label: "Open Up Next event",
      icon: CalendarIcon,
      shortcut: [...B.navUpNext.keycaps],
      keywords: ["upcoming", "next event"],
      disabled: !hasUpNext,
      onClick: withPaletteShortcut("nav-up-next", onOpenUpNext),
    },
    {
      id: "join-up-next-meeting",
      label: "Join Up Next meeting",
      icon: VideoCameraIcon,
      shortcut: [...B.navJoinMeeting.keycaps],
      keywords: ["conference", "video", "call", "meet"],
      disabled: !hasConference,
      onClick: withPaletteShortcut("nav-join-meeting", onJoinMeeting),
    },
  ];
};
