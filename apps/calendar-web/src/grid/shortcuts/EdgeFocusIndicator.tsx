import { type FC } from "react";
import {
  selectEdgeFocusAnnouncement,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";

/**
 * Live region announcing the currently focused start/end edge and the result
 * of edge nudges (e.g. "Editing start time", "Start 9:15 AM").
 */
export const EdgeFocusIndicator: FC = () => {
  const announcement = useEdgeFocusStore(selectEdgeFocusAnnouncement);

  if (!announcement) return null;

  return (
    <span
      aria-live="polite"
      className="block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
      data-edge-focus-indicator=""
      role="status"
    >
      {announcement}
    </span>
  );
};
