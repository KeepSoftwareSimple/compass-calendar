import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { getLegendNavigationCommandItems } from "@web/components/CommandPalette/navigation.cmd.constants";
import { useUpNextEvent } from "@web/components/Sidebar/UpNextCard/useUpNextEvent";
import { focusFirstSidebarItem } from "@web/components/Sidebar/util/sidebarFocus.util";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";

export function usePaletteLegendCmdItems(): CommandItem[] {
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  const { upNext, conferenceUrl, openEventDetails } = useUpNextEvent();

  return getLegendNavigationCommandItems({
    isSidebarOpen,
    hasUpNext: Boolean(upNext),
    hasConference: Boolean(conferenceUrl),
    onToggleSidebar: () => viewActions.toggleSidebar(),
    onFocusMonthPicker: () => {
      focusFirstSidebarItem();
    },
    onOpenUpNext: () => openEventDetails("keyboardEdit"),
    onJoinMeeting: () => {
      if (conferenceUrl) {
        window.open(conferenceUrl, "_blank", "noopener,noreferrer");
      }
    },
  });
}
