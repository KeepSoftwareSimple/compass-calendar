import classNames from "classnames";
import { useEffect, useMemo, useState } from "react";
import { track } from "@web/auth/posthog/track";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { SHORTCUT_LEVEL_UP_TOAST_ID } from "@web/common/constants/toast.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";
import { viewActions } from "@web/events/stores/view.store";
import { type Shortcut } from "@web/shortcuts/global.shortcut.types";
import {
  computeShortcutLevel,
  type ShortcutLevel,
} from "@web/shortcuts/level/shortcut-level";
import {
  setLevelHidden,
  useIsLevelHidden,
} from "@web/shortcuts/level/shortcut-level-hidden.store";
import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import { useUsedShortcutIds } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { useIsAnyCalendarEventFocused } from "@web/shortcuts/tips/useIsAnyCalendarEventFocused";

const LEVEL_PULSE_MS = 700;

// This is the one place the badge imports the registry as a value: the
// level model itself stays pure and never touches it, so it can never be
// pulled into the hotkey registration path (see shortcut-level.ts).
const REGISTRY_IDS = SHORTCUTS_REGISTRY.map((shortcut) => shortcut.id);
const TRY_NEXT_LIMIT = 3;

interface Props {
  sections: ShortcutOverlaySection[];
}

/** Up to `TRY_NEXT_LIMIT` unused, unlocked rows from the current context,
 * edit rows first when an event is focused. */
function tryNextShortcuts(
  sections: ShortcutOverlaySection[],
  usedIds: ReadonlySet<string>,
  eventFocused: boolean,
): Shortcut[] {
  const rows = sections.flatMap((section) => section.shortcuts);
  const ordered = eventFocused
    ? [
        ...rows.filter((row) => row.section === "edit"),
        ...rows.filter((row) => row.section !== "edit"),
      ]
    : rows;

  return ordered
    .filter((row) => !usedIds.has(row.id) && !row.locked)
    .slice(0, TRY_NEXT_LIMIT);
}

/** Seeds the celebrated level silently on first run, then pulses and toasts
 * once per threshold. Skipped while hidden; re-showing celebrates the jump. */
function useShortcutLevelCelebration(
  level: ShortcutLevel,
  hidden: boolean,
): boolean {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (hidden) return;

    const stored = persistentBrowserStore.get(
      STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED,
    );
    if (stored === null) {
      persistentBrowserStore.set(
        STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED,
        String(level.level),
      );
      return;
    }
    if (level.level <= Number(stored)) return;

    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED,
      String(level.level),
    );
    setPulsing(true);
    showStatusToast(
      SHORTCUT_LEVEL_UP_TOAST_ID,
      `Level ${level.level}: ${level.name}. ${level.used} shortcuts learned.`,
    );
    track("shortcut_level_up", {
      level: level.level,
      level_name: level.name,
      used: level.used,
      total: level.total,
    });
    const timer = window.setTimeout(() => setPulsing(false), LEVEL_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [hidden, level.level, level.name, level.used, level.total]);

  return pulsing;
}

/**
 * Sidebar header badge showing the user's shortcut level. Additive to the
 * rotating sidebar tip and the legend's own check marks: hover or focus for
 * the level name, progress, and up to three shortcuts to try next in the
 * current context. Click opens the `?` legend. Hidden entirely when the
 * palette's "Hide shortcut level" toggle is on.
 */
export function ShortcutLevelBadge({ sections }: Props) {
  const eventFocused = useIsAnyCalendarEventFocused();
  const hidden = useIsLevelHidden();
  const usedIds = useUsedShortcutIds();
  const level = useMemo(
    () => computeShortcutLevel(usedIds, REGISTRY_IDS),
    [usedIds],
  );
  const tryNext = useMemo(
    () => tryNextShortcuts(sections, usedIds, eventFocused),
    [sections, usedIds, eventFocused],
  );
  const pulsing = useShortcutLevelCelebration(level, hidden);

  if (hidden) return null;

  const progressText = level.nextName
    ? `${level.used} of ${level.total} shortcuts used, ${level.remaining} more to ${level.nextName}`
    : `${level.used} of ${level.total} shortcuts used. You've used every shortcut here`;

  return (
    <Tooltip interactive placement="bottom">
      <TooltipTrigger asChild>
        <button
          aria-label={`Shortcut level ${level.level}, ${level.name}. ${level.used} of ${level.total} shortcuts used. Open shortcuts.`}
          className={classNames(
            "c-keycap c-focus-ring cursor-pointer text-xs",
            pulsing && "c-level-pulse",
          )}
          onClick={viewActions.toggleShortcuts}
          type="button"
        >
          {`Lv ${level.level}`}
        </button>
      </TooltipTrigger>
      {/* font-normal overrides c-tooltip's font-medium so only the heading
       * and section label carry weight. */}
      <TooltipContent className="flex w-72 flex-col gap-2 px-3 py-2 font-normal">
        <span className="font-semibold text-sm text-text">
          {`Level ${level.level}: ${level.name}`}
        </span>
        {/* text-text, not muted: c-keycap hit the same 12px-on-surface-raised
         * contrast failure (axe 3.97:1 here vs the required 4.5:1). */}
        <span className="text-text text-xs">{progressText}</span>
        {tryNext.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-border border-t pt-2">
            <span className="font-medium text-text text-xs">Try next</span>
            {/* flex-wrap: long key sets (the four arrows) drop under the
             * label instead of truncating it. */}
            {tryNext.map((shortcut) => (
              <div
                key={shortcut.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"
              >
                <span className="min-w-0 flex-1 basis-36">
                  {shortcut.label}
                </span>
                <ShortcutKeys
                  className="ml-auto shrink-0"
                  keys={shortcut.keys}
                />
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-border border-t pt-2">
          <button
            className="c-focus-ring rounded-xs text-accent text-xs hover:underline"
            onClick={viewActions.toggleShortcuts}
            type="button"
          >
            Open shortcuts
          </button>
          <button
            className="c-focus-ring rounded-xs text-text text-xs hover:underline"
            onClick={() => {
              setLevelHidden(true);
              track("shortcut_level_badge_toggled", { hidden: true });
            }}
            type="button"
          >
            Hide level
          </button>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
