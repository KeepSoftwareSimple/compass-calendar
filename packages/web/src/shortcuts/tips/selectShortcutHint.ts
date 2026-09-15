import { rankShortcutHints } from "@web/shortcuts/tips/rankShortcutHints";
import { type ShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import {
  DAY_JUMP_PREFIXES,
  type DayJumpPrefix,
  getShortcutHint,
  type RankedShortcutHint,
  type ShortcutHintId,
  weekDayFocusHint,
} from "@web/shortcuts/tips/shortcut-tips.data";

export type ShortcutHintContext = {
  isFormOpen: boolean;
  isLifeView: boolean;
  isWeekView?: boolean;
  eventFocused: boolean;
  firstEventDone: boolean;
  /** Day prefixes the jump engine can currently land on. */
  jumpableDayPrefixes?: readonly string[];
  /** 0=Sunday … 6=Saturday, used to teach the week forward from today. */
  todayWeekday?: number;
};

const IDLE_POOL = [
  "page-jump",
  "event-jump",
  "command-palette",
  "create-event",
] as const satisfies readonly ShortcutHintId[];

const FOCUSED_POOL = [
  "edit-sequence",
  "nudge",
  "edge-focus",
  ...IDLE_POOL,
] as const satisfies readonly ShortcutHintId[];

/**
 * The day column to teach next: the first jumpable one at or after tomorrow,
 * wrapping through the week. The grid publishes its visible columns, so a
 * day off screen is never taught as a keystroke.
 */
function pickWeekDayPrefix(ctx: ShortcutHintContext): DayJumpPrefix | null {
  const jumpable = new Set(ctx.jumpableDayPrefixes ?? []);
  if (jumpable.size === 0) return null;
  const start = ((ctx.todayWeekday ?? 0) + 1) % DAY_JUMP_PREFIXES.length;
  const ordered = [
    ...DAY_JUMP_PREFIXES.slice(start),
    ...DAY_JUMP_PREFIXES.slice(0, start),
  ];
  return ordered.find((prefix) => jumpable.has(prefix)) ?? null;
}

/** Week view inserts the column-letter tip after event-jump. */
function withWeekDayFocus(
  pool: readonly ShortcutHintId[],
  isWeekView?: boolean,
): readonly ShortcutHintId[] {
  if (!isWeekView) return pool;
  const insertAt = pool.indexOf("event-jump") + 1;
  return [
    ...pool.slice(0, insertAt),
    "week-day-focus",
    ...pool.slice(insertAt),
  ];
}

const FORM_POOL = [
  "save-draft",
  "form-actions",
  "command-palette",
] as const satisfies readonly ShortcutHintId[];

const LIFE_POOL = [
  "life-this-week",
  "command-palette",
] as const satisfies readonly ShortcutHintId[];

const EMPTY_USAGE_PROFILE: ShortcutUsageProfile = {
  version: 2,
  actions: {},
  shortcuts: {},
};

function ranked(
  id: ShortcutHintId,
  reasonCode = getShortcutHint(id).suggestionReason,
): RankedShortcutHint {
  return { ...getShortcutHint(id), reasonCode };
}

/**
 * Next-shortcut for the sidebar status bar. First-event create/save stay
 * sticky; afterwards rankShortcutHints scores the context pool (untried
 * actions, recency, fatigue) and uses the deterministic showcase order as
 * the tie-breaker. Mode indicators and operational status are chosen by
 * the bar itself.
 */
export function selectShortcutHint(
  ctx: ShortcutHintContext,
  demonstratedIds: readonly ShortcutHintId[] = [],
  profile: ShortcutUsageProfile = EMPTY_USAGE_PROFILE,
  now = Date.now(),
): RankedShortcutHint {
  const dayPrefix = pickWeekDayPrefix(ctx);
  const showWeekDay = Boolean(ctx.isWeekView) && dayPrefix !== null;
  const pick = (pool: readonly ShortcutHintId[]) => {
    const winner = rankShortcutHints(pool, demonstratedIds, profile, now);
    if (winner.id !== "week-day-focus" || !dayPrefix) return winner;
    return { ...weekDayFocusHint(dayPrefix), reasonCode: winner.reasonCode };
  };

  if (ctx.isFormOpen && !ctx.firstEventDone) {
    return ranked("first-event-save");
  }
  if (ctx.isFormOpen) {
    return pick(FORM_POOL);
  }
  if (ctx.isLifeView) {
    return pick(LIFE_POOL);
  }
  if (ctx.eventFocused) {
    return pick(withWeekDayFocus(FOCUSED_POOL, showWeekDay));
  }
  if (!ctx.firstEventDone) {
    return ranked("create-event", "first_event");
  }
  return pick(withWeekDayFocus(IDLE_POOL, showWeekDay));
}
