import { type KeyboardEvent } from "react";
import { type GridEvent } from "@web/common/types/web.event.types";
import { dispatchGridEventContextMenuFromElement } from "@web/shortcuts/context-menu/dispatch-grid-event-context-menu";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";

export type GridEventCardActivationOptions = {
  /** When true, Space is swallowed but does not open the menu (paste preview). */
  suppressSpaceMenu?: boolean;
};

/**
 * Enter opens the event form; Space opens the context menu, like right-click.
 * Shared by TimedEventCard and AllDayEventCard so card keyboard behavior
 * cannot drift.
 */
export const gridEventCardActivationKeyDown =
  (
    event: GridEvent,
    onEventKeyDown?: (event: GridEvent) => void,
    options?: GridEventCardActivationOptions,
  ) =>
  (keyEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyEvent.key !== "Enter" && keyEvent.key !== " ") {
      return;
    }

    // Claimed either way: Space would scroll the grid and Enter would reach
    // the row beneath, even when no handler is wired up.
    keyEvent.preventDefault();
    keyEvent.stopPropagation();

    if (keyEvent.key === " ") {
      if (options?.suppressSpaceMenu) {
        return;
      }
      dispatchGridEventContextMenuFromElement(keyEvent.currentTarget);
      recordHandledShortcutInvocation("edit-menu");
      return;
    }

    if (!onEventKeyDown) {
      return;
    }

    onEventKeyDown(event);
    recordHandledShortcutInvocation("edit-open");
  };
