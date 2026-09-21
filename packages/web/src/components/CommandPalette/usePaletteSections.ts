import { useNavigate } from "@tanstack/react-router";
import {
  type CommandItem,
  type CommandSection,
} from "@web/components/CommandPalette/command-palette.types";
import { usePaletteLegendCmdItems } from "@web/components/CommandPalette/hooks/usePaletteLegendCmdItems";
import { useThemeCmdItems } from "@web/components/CommandPalette/hooks/useThemeCmdItems";
import { getMoreCommandPaletteSections } from "@web/components/CommandPalette/more.cmd.constants";
import {
  getNavigationCommandItems,
  getNavigationViewRoute,
} from "@web/components/CommandPalette/navigation.cmd.constants";
import { useNotificationCmdItems } from "@web/notifications/useNotificationCmdItems";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";
import { useTimezoneCmdItems } from "@web/timezone/useTimezoneCmdItems";

/**
 * The navigation rows a palette can offer beyond the view jumps. Life view
 * passes none of them; the calendar palette passes all four.
 */
export type PaletteNavigationHandlers = {
  onGoToToday?: () => void;
  onShowShortcuts?: () => void;
  onPracticeShortcuts?: () => void;
  onShowWelcomeGuide?: () => void;
};

export type PaletteSections = {
  navigation: CommandSection;
  appearance: CommandSection;
  /** Timezone and notification rows, in the order both palettes list them. */
  settingsItems: CommandItem[];
  more: CommandSection[];
};

/**
 * The sections every palette assembles the same way, in one place rather than
 * once per palette: Navigation (view jumps plus the legend's navigate/other
 * rows), Appearance, the shared Settings rows, and the trailing More sections.
 *
 * The calendar palette wraps `settingsItems` in its own longer Settings
 * section (upgrade, account, billing, booking, logout) and inserts a Common
 * Actions section of its own; Life view shows the shared rows as the whole of
 * Settings. Only what actually differs stays at the call site.
 */
export function usePaletteSections(
  currentView: ViewName,
  navigation: PaletteNavigationHandlers = {},
): PaletteSections {
  const navigate = useNavigate();
  const legendCmdItems = usePaletteLegendCmdItems();
  const themeCmdItems = useThemeCmdItems();
  const timezoneCmdItems = useTimezoneCmdItems();
  const notificationCmdItems = useNotificationCmdItems();

  return {
    navigation: {
      id: "navigation",
      heading: "Navigation",
      items: [
        ...getNavigationCommandItems({
          ...navigation,
          currentView,
          onNavigateToView: (viewName) =>
            navigate({ to: getNavigationViewRoute(viewName) }),
        }),
        ...legendCmdItems,
      ],
    },
    appearance: {
      id: "appearance",
      heading: "Appearance",
      items: themeCmdItems,
    },
    settingsItems: [...timezoneCmdItems, ...notificationCmdItems],
    more: getMoreCommandPaletteSections(currentView),
  };
}
