import { useQueryClient } from "@tanstack/react-query";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { openExternalUrl } from "@web/common/utils/browser/open-external-url.util";
import { getFocusedCalendarEvent } from "@web/common/utils/event/event.util";
import { findEventInCache } from "@web/events/queries/event.query.cache";
import { isEventFormOpen, useDraftStore } from "@web/events/stores/draft.store";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import { mapsUrlForLocation } from "@web/views/Forms/EventForm/event-form-field-controls.util";

/**
 * Mod+Shift+M opens the event's location in Google Maps: the open form's
 * draft location, else the focused grid event's. No location, no-op.
 */
export function useOpenLocationShortcut() {
  const queryClient = useQueryClient();

  const resolveLocation = (keyboardEvent: KeyboardEvent): string => {
    if (isEventFormOpen()) {
      return useDraftStore.getState().gridDraft?.values.location ?? "";
    }
    const focused = getFocusedCalendarEvent(keyboardEvent);
    if (!focused) return "";
    const content = findEventInCache(queryClient, focused.eventId)?.content;
    return content?.kind === "details" ? (content.location ?? "") : "";
  };

  useAppShortcut(
    APP_SHORTCUT_BINDINGS.editOpenLocation.hotkey,
    (keyboardEvent) => {
      const location = resolveLocation(keyboardEvent).trim();
      if (location) openExternalUrl(mapsUrlForLocation(location));
    },
    {
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true,
      shortcutId: "edit-open-location",
    },
  );
}
