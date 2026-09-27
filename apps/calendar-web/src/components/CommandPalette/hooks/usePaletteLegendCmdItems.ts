import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { getLegendNavigationCommandItems } from "@web/components/CommandPalette/navigation.cmd.constants";
import { useUpNextAvailabilityStore } from "@web/components/Sidebar/UpNextCard/up-next.availability.store";
import { focusFirstSidebarItem } from "@web/components/Sidebar/util/sidebarFocus.util";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";

export function usePaletteLegendCmdItems(): CommandItem[] {
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  const { hasUpNext, hasConference, openEventDetails, joinMeeting } =
    useUpNextAvailabilityStore();

  return getLegendNavigationCommandItems({
    isSidebarOpen,
    hasUpNext,
    hasConference,
    onToggleSidebar: () => viewActions.toggleSidebar(),
    onFocusMonthPicker: () => {
      focusFirstSidebarItem();
    },
    onOpenUpNext: () => openEventDetails("keyboardEdit"),
    onJoinMeeting: joinMeeting,
  });
}
