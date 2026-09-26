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
import { computeShortcutLevel } from "@web/shortcuts/level/shortcut-level";
import {
  setLevelHidden,
  useIsLevelHidden,
} from "@web/shortcuts/level/shortcut-level-hidden.store";
import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import {
  usedShortcutIds,
  useShortcutUsageProfile,
} from "@web/shortcuts/tips/shortcut-personalization.storage";
import { useIsAnyCalendarEventFocused } from "@web/shortcuts/tips/useIsAnyCalendarEventFocused";

export const LEVEL_PULSE_MS = 700;

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

/**
 * Sidebar footer badge showing the user's shortcut level. Additive to the
 * rotating sidebar tip and the legend's own check marks: hover or focus for
 * the level name, progress, and up to three shortcuts to try next in the
 * current context. Click opens the `?` legend. Hidden entirely when the
 * palette's "Hide shortcut level" toggle is on.
 */
export function ShortcutLevelBadge({ sections }: Props) {
  const profile = useShortcutUsageProfile();
  const eventFocused = useIsAnyCalendarEventFocused();
  const hidden = useIsLevelHidden();

  // Deliberately keyed on `shortcuts` alone: a tip-impression write only
  // touches `actions` (every ~5s dwell), and that must not recompute this.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  const usedIds = useMemo(() => usedShortcutIds(profile), [profile.shortcuts]);
  const level = useMemo(
    () => computeShortcutLevel(usedIds, REGISTRY_IDS),
    [usedIds],
  );
  const tryNext = useMemo(
    () => tryNextShortcuts(sections, usedIds, eventFocused),
    [sections, usedIds, eventFocused],
  );
  const [pulsing, setPulsing] = useState(false);

  // Celebrates a level-up once: the last celebrated level is stored so a
  // returning user with existing history is not congratulated for a level
  // they already had (an absent key seeds silently on first run). Skipped
  // entirely while hidden; re-showing celebrates the accumulated jump once.
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

  if (hidden) return null;

  const progressText = level.nextName
    ? `${level.used} of ${level.total} shortcuts used, ${level.remaining} more to ${level.nextName}`
    : `${level.used} of ${level.total} shortcuts used. You've used every shortcut here`;

  return (
    <Tooltip interactive placement="top">
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
      <TooltipContent className="flex max-w-60 flex-col gap-1.5">
        <span className="font-medium text-text">
          {`Level ${level.level}: ${level.name}`}
        </span>
        <span className="text-text-muted text-xs">{progressText}</span>
        {tryNext.length > 0 ? (
          <div className="flex flex-col gap-1 border-border border-t pt-1.5">
            <span className="text-text-muted text-xs">Try next</span>
            {tryNext.map((shortcut) => (
              <div
                key={shortcut.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate">{shortcut.label}</span>
                <ShortcutKeys keys={shortcut.keys} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-border border-t pt-1.5">
          <button
            className="c-focus-ring rounded-xs text-accent text-xs hover:underline"
            onClick={viewActions.toggleShortcuts}
            type="button"
          >
            Open shortcuts
          </button>
          <button
            className="c-focus-ring rounded-xs text-text-muted text-xs hover:text-text hover:underline"
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
