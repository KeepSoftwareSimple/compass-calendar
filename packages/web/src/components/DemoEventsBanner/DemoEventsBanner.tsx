import { type FC } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { pointerShortcutAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  DEMO_EVENTS_BANNER_SHORTCUT_KEY,
  useNoticeActionShortcut,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

export function hasDismissedDemoEventsBanner(): boolean {
  if (!persistentBrowserStore.isAvailable()) return true;
  return (
    persistentBrowserStore.get(
      STORAGE_KEYS.HAS_DISMISSED_DEMO_EVENTS_BANNER,
    ) === "true"
  );
}

export function dismissDemoEventsBanner(): void {
  persistentBrowserStore.set(
    STORAGE_KEYS.HAS_DISMISSED_DEMO_EVENTS_BANNER,
    "true",
  );
}

interface DemoEventsBannerProps {
  onDismiss: () => void;
}

/**
 * The first thing a new visitor reads on the calendar, so it has to behave
 * like the calendar: no button, its own key dismisses it, and a click
 * anywhere on it shows that key through the pointer hint instead of acting.
 */
export const DemoEventsBanner: FC<DemoEventsBannerProps> = ({ onDismiss }) => {
  useNoticeActionShortcut(DEMO_EVENTS_BANNER_SHORTCUT_KEY, onDismiss);

  return (
    <div
      className="flex items-center justify-between gap-3 border-border border-b bg-surface-panel px-4 py-2 text-text-muted text-xs"
      role="status"
      {...pointerShortcutAttributes(DEMO_EVENTS_BANNER_SHORTCUT_KEY)}
    >
      <span className="inline-flex flex-wrap items-center gap-1.5">
        Sample events to help you explore. Clear them from the command palette
        <ShortcutKeys keys={[...KEYMAP.commandPalette.keycaps]} />
      </span>
      <span className="inline-flex shrink-0 items-center gap-2 text-text">
        Okay
        <ShortcutKeys keys={DEMO_EVENTS_BANNER_SHORTCUT_KEY} />
      </span>
    </div>
  );
};
