import { type FC, useEffect } from "react";
import {
  eventJumpActions,
  selectEventJumpActive,
  selectEventJumpAnnouncement,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

const EXIT_ANNOUNCEMENT_LINGER_MS = 1200;

export const EVENT_JUMP_IDLE_HINT_PARTS: readonly ShortcutTipPart[] = [
  "Event jump · ",
  { key: "Esc" },
];

export const eventJumpSelectionHintParts = (
  announcement: string,
): readonly ShortcutTipPart[] => [
  "Jump · ",
  announcement,
  " · ",
  { key: "Esc" },
];

/**
 * Persistent badge + live region while event-jump mode is on. Stays mounted
 * briefly after exit so "Event jump off" can be spoken.
 */
export const EventJumpIndicator: FC = () => {
  const isActive = useEventJumpStore(selectEventJumpActive);
  const announcement = useEventJumpStore(selectEventJumpAnnouncement);

  useEffect(() => {
    if (isActive || !announcement) return;
    const spoken = announcement;
    const timer = window.setTimeout(() => {
      if (useEventJumpStore.getState().announcement === spoken) {
        eventJumpActions.clearAnnouncement();
      }
    }, EXIT_ANNOUNCEMENT_LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [isActive, announcement]);

  if (!isActive && !announcement) return null;

  const parts: readonly ShortcutTipPart[] | null = !isActive
    ? null
    : announcement && announcement !== "Event jump on"
      ? eventJumpSelectionHintParts(announcement)
      : EVENT_JUMP_IDLE_HINT_PARTS;

  return (
    <span
      aria-live="polite"
      className="block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
      data-event-jump-indicator=""
      role="status"
    >
      {parts ? <ShortcutTipParts parts={parts} /> : announcement}
    </span>
  );
};
