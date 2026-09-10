import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import {
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  DATA_TIMED_GRID_ROW,
  ID_ALLDAY_COLUMNS,
  ID_GRID_ALLDAY_ROW,
  ID_GRID_COLUMNS_TIMED,
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_EVENTS_TIMED,
  ID_GRID_MAIN,
} from "@web/common/constants/web.constants";
import { GRID_TIME_STEP } from "@web/grid/grid.constants";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

export const POINTER_ACTION_ATTRIBUTE = "data-pointer-action";
export const POINTER_EVENT_ID_ATTRIBUTE = "data-pointer-event-id";
export const POINTER_SHORTCUT_ATTRIBUTE = "data-pointer-shortcut";
export const POINTER_PROVIDER_ATTRIBUTE = "data-pointer-provider";
/** Opt a subtree out of the click hint (MobileGate, welcome, copy buttons). */
export const POINTER_PASS_ATTRIBUTE = "data-pointer-pass";
export const POINTER_EVENT_JUMP_REQUEST = "compass:pointer-event-jump";
export const POINTER_GRID_CREATE_REQUEST = "compass:pointer-grid-create";

export const POINTER_ACTIONS = {
  eventOpen: "event.open",
  datePick: "calendar.date-pick",
  goToToday: "calendar.today",
  switchView: "calendar.view",
  sidebarClose: "sidebar.close",
  sidebarOpen: "sidebar.open",
  startTrial: "billing.start-trial",
  reconnectGoogle: "google.reconnect",
  upNextDismiss: "up-next.dismiss",
} as const;

export type PointerActionId =
  (typeof POINTER_ACTIONS)[keyof typeof POINTER_ACTIONS];

export type PointerShortcutKey = string | string[];

/**
 * "Blocked" is historical: clicks pass through since #3171. The attempt now
 * describes what a click aimed at so the hint can name the keyboard path,
 * whether the click did nothing (`performed` false) or already ran the
 * action through a working control (`performed` true).
 */
export type BlockedPointerAttempt = {
  actionId: PointerActionId | "grid.timed" | "grid.all-day" | "unknown";
  /** True when the clicked control performs the action itself. */
  performed?: boolean;
  eventId?: string;
  shortcutKey?: PointerShortcutKey;
  gridDate?: string;
  gridTimeKey?: string;
  gridTimeLabel?: string;
  provider?: ProviderKind;
};

/**
 * Keys to advertise after a working annotated control is clicked and the
 * element carries no `data-pointer-shortcut` of its own.
 */
export const POINTER_ACTION_KEYS: Partial<
  Record<PointerActionId, readonly string[]>
> = {
  [POINTER_ACTIONS.sidebarClose]: ["]"],
  [POINTER_ACTIONS.sidebarOpen]: ["]"],
  [POINTER_ACTIONS.goToToday]: ["T"],
  [POINTER_ACTIONS.switchView]: ["W", "D", "L"],
  [POINTER_ACTIONS.upNextDismiss]: ["Esc"],
  [POINTER_ACTIONS.startTrial]: ["S"],
  [POINTER_ACTIONS.reconnectGoogle]: ["G"],
};

const POINTER_ACTION_IDS = new Set<string>(Object.values(POINTER_ACTIONS));

const isPointerActionId = (value: string): value is PointerActionId =>
  POINTER_ACTION_IDS.has(value);

export const pointerActionKeys = (
  actionId: BlockedPointerAttempt["actionId"],
): readonly string[] | undefined =>
  isPointerActionId(actionId) ? POINTER_ACTION_KEYS[actionId] : undefined;

export const resolveBlockedPointerAttempt = (
  path: EventTarget[],
): BlockedPointerAttempt => {
  let actionId: PointerActionId | "unknown" = "unknown";
  let eventId: string | undefined;
  let shortcutKey: PointerShortcutKey | undefined;
  let provider: ProviderKind | undefined;

  for (const target of path) {
    if (!(target instanceof HTMLElement)) continue;
    if (actionId === "unknown") {
      const action = target.getAttribute(POINTER_ACTION_ATTRIBUTE);
      if (action && isPointerActionId(action)) {
        actionId = action;
        eventId = target.getAttribute(POINTER_EVENT_ID_ATTRIBUTE) ?? undefined;
        const providerRaw = target.getAttribute(POINTER_PROVIDER_ATTRIBUTE);
        const providerResult = ProviderKindSchema.safeParse(providerRaw);
        if (providerResult.success) {
          provider = providerResult.data;
        }
      }
    }
    if (shortcutKey === undefined) {
      const shortcut = target.getAttribute(POINTER_SHORTCUT_ATTRIBUTE);
      if (shortcut) shortcutKey = parsePointerShortcut(shortcut);
    }
    if (actionId !== "unknown" && shortcutKey !== undefined) break;
  }

  return {
    actionId,
    ...(eventId ? { eventId } : {}),
    ...(shortcutKey ? { shortcutKey } : {}),
    ...(provider ? { provider } : {}),
  };
};

/** Encode a one-key or chord shortcut onto `data-pointer-shortcut`. */
export const pointerShortcutAttributes = (
  key: string | readonly string[],
): { readonly [POINTER_SHORTCUT_ATTRIBUTE]: string } => ({
  [POINTER_SHORTCUT_ATTRIBUTE]:
    typeof key === "string" ? key : JSON.stringify(key),
});

/**
 * Reverse `pointerShortcutAttributes`. A JSON array is a chord (`Mod+K`);
 * anything else is a single key, including a literal that happens to start
 * with `[`.
 */
export const parsePointerShortcut = (raw: string): PointerShortcutKey => {
  if (!raw.startsWith("[")) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }
  } catch {
    // A single-key annotation that starts with `[`.
  }
  return raw;
};

export const pointerPassAttributes = {
  [POINTER_PASS_ATTRIBUTE]: "",
};

const PRIMARY_POINTER_BUTTON = 0;

/**
 * Right/middle clicks on an event must not start event jump: `m` would then
 * be consumed as Monday instead of opening the context menu.
 */
export const teachingFromBlockedPointer = (
  path: EventTarget[],
  button = PRIMARY_POINTER_BUTTON,
): { attempt: BlockedPointerAttempt; jumpEventId?: string } => {
  const attempt = resolveBlockedPointerAttempt(path);
  const isPrimary = button === PRIMARY_POINTER_BUTTON;
  if (
    isPrimary &&
    attempt.actionId === POINTER_ACTIONS.eventOpen &&
    attempt.eventId
  ) {
    return { attempt, jumpEventId: attempt.eventId };
  }
  if (!isPrimary && attempt.actionId === POINTER_ACTIONS.eventOpen) {
    return { attempt: { actionId: "unknown" } };
  }
  return { attempt };
};

export const eventPointerActionAttributes = (eventId?: string) =>
  eventId
    ? {
        [POINTER_ACTION_ATTRIBUTE]: POINTER_ACTIONS.eventOpen,
        [POINTER_EVENT_ID_ATTRIBUTE]: eventId,
      }
    : {};

export const requestPointerEventJump = (eventId: string) => {
  document.dispatchEvent(
    new CustomEvent(POINTER_EVENT_JUMP_REQUEST, { detail: { eventId } }),
  );
};

export type PointerGridIntent = {
  date: string;
  kind: "all-day" | "timed";
  /** Exact effective-zone instant selected by the pointer. */
  start?: string;
  timeKey?: string;
  timeLabel?: string;
};

export const requestPointerGridCreate = (intent: PointerGridIntent) => {
  document.dispatchEvent(
    new CustomEvent(POINTER_GRID_CREATE_REQUEST, { detail: intent }),
  );
};

export const pointerGridIntent = (event: Event): PointerGridIntent | null => {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail;
  if (
    !detail ||
    typeof detail.date !== "string" ||
    (detail.kind !== "all-day" && detail.kind !== "timed")
  ) {
    return null;
  }
  return {
    date: detail.date,
    kind: detail.kind,
    ...(typeof detail.timeKey === "string" ? { timeKey: detail.timeKey } : {}),
    ...(typeof detail.start === "string" ? { start: detail.start } : {}),
    ...(typeof detail.timeLabel === "string"
      ? { timeLabel: detail.timeLabel }
      : {}),
  };
};

const ALL_DAY_GRID_IDS = new Set([
  ID_ALLDAY_COLUMNS,
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_ALLDAY_ROW,
]);

const TIMED_GRID_IDS = new Set([
  ID_GRID_COLUMNS_TIMED,
  ID_GRID_EVENTS_TIMED,
  ID_GRID_MAIN,
]);

const gridKindFromElement = (
  target: HTMLElement,
): PointerGridIntent["kind"] | undefined => {
  if (ALL_DAY_GRID_IDS.has(target.id)) return "all-day";
  if (TIMED_GRID_IDS.has(target.id)) return "timed";
  // Hour lines sit on top of the day columns, so an empty click hits a row
  // (or #mainGrid) rather than #timedColumns.
  if (target.hasAttribute(DATA_TIMED_GRID_ROW)) return "timed";
};

const gridDateFromColumns = (
  kind: PointerGridIntent["kind"],
  clientX: number,
): string | undefined => {
  const columnsRoot = document.getElementById(
    kind === "all-day" ? ID_ALLDAY_COLUMNS : ID_GRID_COLUMNS_TIMED,
  );
  const columns = [
    ...(columnsRoot?.querySelectorAll<HTMLElement>("[data-grid-date]") ?? []),
  ];
  const underPointer = columns.find((column) => {
    const rect = column.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right;
  })?.dataset.gridDate;
  if (underPointer) return underPointer;

  const todayKey = dayjs()
    .tz(getEffectiveTimeZone())
    .format(YEAR_MONTH_DAY_FORMAT);
  return (
    columns.find((column) => column.dataset.gridDate === todayKey)?.dataset
      .gridDate ?? columns[0]?.dataset.gridDate
  );
};

const timedIntentAt = (
  date: string,
  clientY: number,
): PointerGridIntent | null => {
  const grid = document.getElementById(ID_GRID_MAIN);
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  const relative = grid.scrollTop + clientY - rect.top;
  const rawMinute = (relative / grid.scrollHeight) * 1440;
  const minute = Math.min(
    24 * 60 - GRID_TIME_STEP,
    Math.max(0, Math.round(rawMinute / GRID_TIME_STEP) * GRID_TIME_STEP),
  );
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  const hh = String(hour).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const timeKey = `${hh}${mm}`;
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minutes));
  const start = dayjs
    .tz(`${date}T${hh}:${mm}`, getEffectiveTimeZone())
    .format();
  return { date, kind: "timed", start, timeKey, timeLabel };
};

export const pointerGridIntentFromPointer = (
  path: EventTarget[],
  clientX: number,
  clientY: number,
): PointerGridIntent | null => {
  let date: string | undefined;
  let kind: PointerGridIntent["kind"] | undefined;
  for (const target of path) {
    if (!(target instanceof HTMLElement)) continue;
    date ??= target.dataset.gridDate;
    kind ??= gridKindFromElement(target);
    if (date && kind) break;
  }
  if (!kind) return null;
  date ??= gridDateFromColumns(kind, clientX);
  if (!date) return null;
  if (kind === "all-day") return { date, kind };
  return timedIntentAt(date, clientY);
};

export const pointerEventJumpId = (event: Event): string | undefined => {
  if (!(event instanceof CustomEvent)) return undefined;
  const eventId = event.detail?.eventId;
  return typeof eventId === "string" && eventId.length > 0
    ? eventId
    : undefined;
};
