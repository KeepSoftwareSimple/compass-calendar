import { type FC } from "react";
import {
  selectEdgeFocusAnnouncement,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { edgeFocusHintParts } from "@web/grid/shortcuts/edge-focus-hint.parts";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";

/**
 * Sidebar contextual help while an event edge or whole-body move is focused.
 */
export const EdgeFocusIndicator: FC = () => {
  const announcement = useEdgeFocusStore(selectEdgeFocusAnnouncement);
  const edge = useEdgeFocusStore((state) => state.edge);
  const isAllDay = useEdgeFocusStore((state) => state.isAllDay);

  if (!announcement) return null;

  const parts = edgeFocusHintParts(edge, isAllDay, announcement);

  return (
    <span
      aria-live="polite"
      className="block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
      data-edge-focus-indicator=""
      role="status"
    >
      <ShortcutTipParts parts={parts} />
    </span>
  );
};
