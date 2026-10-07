import { type KeyboardEvent } from "react";
import { type GridEvent } from "@web/common/types/web.event.types";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";

/**
 * Enter and Space open a card, the activation keys its `role="button"`
 * advertises. Shared by TimedEventCard and AllDayEventCard so one card
 * cannot drift into swallowing the keys or skipping the telemetry.
 */
export const gridEventCardActivationKeyDown =
  (event: GridEvent, onEventKeyDown?: (event: GridEvent) => void) =>
  (keyEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyEvent.key !== "Enter" && keyEvent.key !== " ") {
      return;
    }

    // Claimed either way: Space would scroll the grid and Enter would reach
    // the row beneath, even when no handler is wired up.
    keyEvent.preventDefault();
    keyEvent.stopPropagation();
    if (!onEventKeyDown) {
      return;
    }

    onEventKeyDown(event);
    recordHandledShortcutInvocation("edit-open");
  };
