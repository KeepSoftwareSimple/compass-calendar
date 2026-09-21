import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { type FC } from "react";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { viewActions } from "@web/events/stores/view.store";
import { POINTER_ACTIONS } from "@web/shortcuts/keyboard-only/pointer-action";
import { useCloseEventForm } from "@web/views/Forms/hooks/useCloseEventForm";
import {
  focusSidebarControl,
  SIDEBAR_DISMISS_CONTROL,
  SIDEBAR_TOGGLE_CONTROL,
} from "./util/sidebarControlFocus.util";

/**
 * Narrow-layout dismiss control rendered inside the sidebar. Uses a distinct
 * accessible name from the header toggle so the two controls do not collide
 * while the panel is open. Closes both the sidebar preference and any open
 * event form (Day/Week keep the panel mounted for event details), then
 * restores focus to the header toggle control.
 */
export const SidebarCloseButton: FC = () => {
  const closeEventForm = useCloseEventForm();
  const isEventFormOpen = useDraftStore(selectIsEventFormOpen);

  return (
    <TooltipWrapper
      description="Close sidebar"
      onClick={() => {
        viewActions.setSidebarOpen(false);
        if (isEventFormOpen) {
          closeEventForm();
        }
        // The header toggle stays mounted; move focus there after this
        // in-sidebar control unmounts.
        focusSidebarControl(SIDEBAR_TOGGLE_CONTROL);
      }}
      shortcut="]"
    >
      <button
        type="button"
        aria-label="Dismiss sidebar"
        data-sidebar-control={SIDEBAR_DISMISS_CONTROL}
        data-pointer-action={POINTER_ACTIONS.sidebarClose}
        className="c-focus-ring flex h-6 w-6 cursor-pointer items-center justify-center text-text-muted"
      >
        <XIcon aria-hidden="true" size={16} />
      </button>
    </TooltipWrapper>
  );
};
