import {
  formatHotkey,
  type RegisterableHotkey,
  rawHotkeyToParsedHotkey,
} from "@tanstack/react-hotkeys";
import { track } from "@web/auth/posthog/track";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { getAppLockReasons } from "@web/shortcuts/app-lock";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import {
  readShortcutUsageProfile,
  type ShortcutActionUsage,
  type ShortcutUsageProfile,
  writeShortcutUsageProfile,
} from "@web/shortcuts/tips/shortcut-personalization.storage";
import {
  getHintPlainText,
  getShortcutHint,
  type RankedShortcutHint,
  type ShortcutHint,
  type ShortcutHintId,
} from "@web/shortcuts/tips/shortcut-tips.data";

const IMPRESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const PRESENTATION_DEDUPE_MS = 30 * 1000;
export const IMPRESSION_DWELL_MS = 5_000;

export type ShortcutInvocationMethod = "keyboard" | "click";

type ActiveSuggestion = Pick<
  RankedShortcutHint,
  "actionId" | "featureArea" | "id" | "reasonCode"
> & { suggestionText: string };

type SuggestionPresentation = Omit<ActiveSuggestion, "suggestionText"> & {
  suggestionText?: string;
  parts?: ShortcutHint["parts"];
};

let activeSuggestion: ActiveSuggestion | null = null;
const lastPresentationByKey = new Map<string, number>();
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
let dwellVisibilityListener: (() => void) | null = null;

const hintIdentityProperties = (
  hint: Pick<ShortcutHint, "actionId" | "featureArea" | "id" | "parts">,
) => ({
  action_id: hint.actionId,
  feature_area: hint.featureArea,
  shortcut_type: hint.id,
  suggestion_text: getHintPlainText(hint),
});

const suggestionProperties = (suggestion: ActiveSuggestion) => ({
  action_id: suggestion.actionId,
  feature_area: suggestion.featureArea,
  rank: 1,
  reason_code: suggestion.reasonCode,
  shortcut_type: suggestion.id,
  source: "sidebar_status",
  suggestion_text: suggestion.suggestionText,
});

const resolvePresentedSuggestion = (
  suggestion: SuggestionPresentation,
): ActiveSuggestion => ({
  actionId: suggestion.actionId,
  featureArea: suggestion.featureArea,
  id: suggestion.id,
  reasonCode: suggestion.reasonCode,
  suggestionText:
    suggestion.suggestionText ??
    getHintPlainText({ parts: suggestion.parts ?? [] }),
});

const emptyUsage = (): ShortcutActionUsage => ({
  invocations: 0,
  recentImpressions: 0,
});

function updateUsage(
  actionId: RankedShortcutHint["actionId"],
  update: (current: ShortcutActionUsage) => ShortcutActionUsage,
): void {
  const current = readShortcutUsageProfile();
  const next: ShortcutUsageProfile = {
    version: 2,
    actions: {
      ...current.actions,
      [actionId]: update(current.actions[actionId] ?? emptyUsage()),
    },
    shortcuts: current.shortcuts,
  };
  writeShortcutUsageProfile(next);
}

/** Registry ids are `<section-prefix>-…`; `nav-*` is the navigate section. */
const SECTION_BY_ID_PREFIX = {
  nav: "navigate",
  create: "create",
  focus: "focus",
  edit: "edit",
  other: "other",
} as const;

function sectionForRegistryId(
  shortcutId: ShortcutRegistryId,
): string | undefined {
  const prefix = shortcutId.split("-")[0];
  if (prefix === undefined) return undefined;
  return SECTION_BY_ID_PREFIX[prefix as keyof typeof SECTION_BY_ID_PREFIX];
}

function updateShortcutUsage(
  shortcutId: ShortcutRegistryId,
  now: number,
): void {
  const current = readShortcutUsageProfile();
  const existing = current.shortcuts[shortcutId] ?? emptyUsage();
  const next: ShortcutUsageProfile = {
    version: 2,
    actions: current.actions,
    shortcuts: {
      ...current.shortcuts,
      [shortcutId]: {
        ...existing,
        invocations: existing.invocations + 1,
        lastInvokedAt: now,
      },
    },
  };
  writeShortcutUsageProfile(next);
}

/** Records that a legend shortcut ran. `handled` means the handler ran, not
 * that it changed anything. Skip the PostHog event when a taught outcome
 * site already reports `shortcut_invoked` for the same press. */
export function recordHandledShortcutInvocation(
  shortcutId: ShortcutRegistryId,
  options: {
    emitEvent?: boolean;
    invocationMethod?: ShortcutInvocationMethod;
    now?: number;
  } = {},
): void {
  const {
    emitEvent = true,
    invocationMethod = "keyboard",
    now = Date.now(),
  } = options;
  const section = sectionForRegistryId(shortcutId);
  updateShortcutUsage(shortcutId, now);
  if (!emitEvent || !section) return;

  track("shortcut_invoked", {
    invocation_method: invocationMethod,
    outcome: "handled",
    section,
    shortcut_id: shortcutId,
    source: invocationMethod,
  });
}

function clearDwellWait(): void {
  if (dwellTimer !== null) {
    clearTimeout(dwellTimer);
    dwellTimer = null;
  }
  if (dwellVisibilityListener) {
    document.removeEventListener("visibilitychange", dwellVisibilityListener);
    dwellVisibilityListener = null;
  }
}

function recordImpression(presented: ActiveSuggestion, now: number): void {
  const dedupeKey = `${presented.id}:${presented.reasonCode}:${presented.suggestionText}`;
  const lastPresentation = lastPresentationByKey.get(dedupeKey);
  if (
    lastPresentation !== undefined &&
    now - lastPresentation < PRESENTATION_DEDUPE_MS
  ) {
    return;
  }
  lastPresentationByKey.set(dedupeKey, now);
  updateUsage(presented.actionId, (current) => {
    const isRecent =
      current.lastShownAt !== undefined &&
      now - current.lastShownAt < IMPRESSION_WINDOW_MS;
    return {
      ...current,
      lastShownAt: now,
      recentImpressions: isRecent ? current.recentImpressions + 1 : 1,
    };
  });
  track("shortcut_suggestion_shown", {
    ...suggestionProperties(presented),
    dwell_ms: IMPRESSION_DWELL_MS,
    outcome: "shown",
  });
}

/**
 * Starts one visible sidebar-tip presentation. The tip is armed immediately
 * so an invocation in the first 5 seconds still counts as `was_suggested`.
 * The usage update and `shortcut_suggestion_shown` wait for 5 seconds of
 * dwell in a visible tab. React remounts of the same tip still dedupe for
 * 30 seconds once an impression is recorded.
 */
export function beginShortcutSuggestionPresentation(
  suggestion: SuggestionPresentation,
  now = Date.now(),
): () => void {
  const presented = resolvePresentedSuggestion(suggestion);
  activeSuggestion = presented;
  clearDwellWait();

  const tryRecord = () => {
    dwellTimer = null;
    if (document.visibilityState !== "visible") {
      dwellVisibilityListener = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener(
          "visibilitychange",
          dwellVisibilityListener!,
        );
        dwellVisibilityListener = null;
        recordImpression(presented, Date.now());
      };
      document.addEventListener("visibilitychange", dwellVisibilityListener);
      return;
    }
    recordImpression(presented, now + IMPRESSION_DWELL_MS);
  };

  dwellTimer = setTimeout(tryRecord, IMPRESSION_DWELL_MS);

  return () => {
    clearDwellWait();
    if (activeSuggestion === presented) activeSuggestion = null;
  };
}

/** Records a successful taught shortcut outcome. This is deliberately called
 * from the outcome sites, not the raw keydown path. */
export function recordShortcutInvocation(
  hintId: ShortcutHintId,
  now = Date.now(),
  invocationMethod: ShortcutInvocationMethod = "keyboard",
): void {
  const hint = getShortcutHint(hintId);
  const wasSuggested = activeSuggestion?.actionId === hint.actionId;
  updateUsage(hint.actionId, (current) => ({
    ...current,
    invocations: current.invocations + 1,
    lastInvokedAt: now,
  }));

  track("shortcut_invoked", {
    ...hintIdentityProperties(hint),
    invocation_method: invocationMethod,
    outcome: "succeeded",
    reason_code: "registered_shortcut",
    source: invocationMethod,
    suggestion_text:
      wasSuggested && activeSuggestion
        ? activeSuggestion.suggestionText
        : getHintPlainText(hint),
    was_suggested: wasSuggested,
  });

  if (wasSuggested && activeSuggestion) {
    track("shortcut_suggestion_engaged", {
      ...suggestionProperties(activeSuggestion),
      invocation_method: invocationMethod,
      outcome: "invoked",
      was_suggested: true,
    });
  }
}

const VIEW_BY_ROUTE = [
  [ROOT_ROUTES.WEEK, "week_view"],
  [ROOT_ROUTES.DAY, "day_view"],
  [ROOT_ROUTES.LIFE, "life_view"],
] as const;

/** The calendar surface a shortcut was attempted on, from the URL alone. */
export function viewFromPathname(pathname: string): string {
  const match = VIEW_BY_ROUTE.find(
    ([route]) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return match?.[1] ?? "other";
}

/** Lock owners as a stable, low-cardinality key. OverlayPanel registers
 * `overlayPanel:<title slug>:<useId>` per instance so nested panels unlock
 * independently; the instance suffix is dropped here so PostHog can group on
 * `overlayPanel:<title slug>`. */
function lockContext(): string {
  const names = new Set(
    getAppLockReasons().map((reason) =>
      reason.split(":").slice(0, 2).join(":"),
    ),
  );
  return [...names].sort().join("+") || "unknown";
}

/** Static registration string for a hotkey (e.g. "Shift+ArrowLeft"). */
function registeredHotkeyLabel(hotkey: RegisterableHotkey): string {
  if (typeof hotkey === "string") return hotkey;
  return formatHotkey(rawHotkeyToParsedHotkey(hotkey));
}

export type ShortcutUnavailableAttempt = {
  /** How the user tried to run the shortcut. Defaults from `event`. */
  invocationMethod?: ShortcutInvocationMethod;
  /** The hotkey as registered, never the raw key the user typed. */
  hotkey?: RegisterableHotkey;
  /** The keydown/keyup that matched the registration. */
  event?: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat"
  >;
};

/** Why a registered shortcut could not run: the account cannot write
 * (`billing_locked`, with or without the gate on screen) or some other
 * overlay owned the keyboard (`overlay_open`). */
export type ShortcutUnavailableReason = "billing_locked" | "overlay_open";

/** A registered shortcut reached the app handler but could not run.
 * `reason_code` isolates the billing case; `context` names the lock owner(s)
 * (settingsModal, commandPalette, billingGate...) so we can tell "pressed Tab
 * inside a modal form" apart from "wanted to create an event behind the
 * billing gate". In look-around mode no lock is held, so `context` reads
 * "unknown" and `reason_code` carries the signal.
 * Only the static registration string, lock names, view name, modifier
 * flags, and the focused element's tag are captured. No typed value, DOM
 * content, or raw key value is captured. */
export function recordShortcutUnavailableAttempt(
  hintId: ShortcutHintId,
  reasonCode: ShortcutUnavailableReason,
  attempt: ShortcutUnavailableAttempt = {},
): void {
  const hint = getShortcutHint(hintId);
  const invocationMethod =
    attempt.invocationMethod ?? (attempt.event ? "keyboard" : "click");
  const { event, hotkey } = attempt;

  track("shortcut_unavailable_attempt", {
    ...hintIdentityProperties(hint),
    invocation_method: invocationMethod,
    outcome: "unavailable",
    reason_code: reasonCode,
    source: invocationMethod,
    view: viewFromPathname(window.location.pathname),
    ...(hotkey !== undefined
      ? { shortcut_key: registeredHotkeyLabel(hotkey) }
      : {}),
    ...(event
      ? {
          active_element:
            document.activeElement?.tagName.toLowerCase() ?? "none",
          context: lockContext(),
          is_repeat: event.repeat,
          was_modifier_held:
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
        }
      : { context: lockContext() }),
  });
}

/** Test-only reset for module-level presentation dedupe state. */
export function resetShortcutTelemetryForTests(): void {
  activeSuggestion = null;
  lastPresentationByKey.clear();
  clearDwellWait();
}
