import { useEffect } from "react";
import { getCalendarEventIdFromElement } from "@web/common/utils/event/event.util";
import { useToggleEventHidden } from "@web/events/hidden/hidden-events.query";
import { shouldStandDownBareLetterShortcut } from "@web/shortcuts/bare-letter-stand-down";
import { HIDE_EVENT_LETTER } from "@web/shortcuts/hide-event/hide-event.constants";
import { isBareLetterKey } from "@web/shortcuts/is-bare-letter-key";

/**
 * Bare `x` toggles the focused event's hidden state. Same capture-listener
 * style and yields as `m`: stands down while app-locked, typing, an `e`…
 * sequence is armed, or event jump owns letters.
 */
export function useHideEventShortcut() {
  const toggleEventHidden = useToggleEventHidden();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!isBareLetterKey(event, HIDE_EVENT_LETTER)) return;
      if (shouldStandDownBareLetterShortcut(event)) return;

      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const eventId = getCalendarEventIdFromElement(active);
      if (!eventId) return;

      event.preventDefault();
      event.stopPropagation();
      toggleEventHidden(eventId);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [toggleEventHidden]);
}
