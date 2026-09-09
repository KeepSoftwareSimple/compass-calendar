import {
  formatHotkey,
  type RegisterableHotkey,
  rawHotkeyToParsedHotkey,
} from "@tanstack/react-hotkeys";
import { track } from "@web/auth/posthog/track";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { getAppLockReasons } from "@web/shortcuts/app-lock";
import {
  readShortcutUsageProfile,
  type ShortcutActionUsage,
  type ShortcutUsageProfile,
  writeShortcutUsageProfile,
} from "@web/shortcuts/tips/shortcut-personalization.storage";
import {
  getShortcutHint,
  type RankedShortcutHint,
  type ShortcutHintId,
} from "@web/shortcuts/tips/shortcut-tips.data";

const IMPRESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const PRESENTATION_DEDUPE_MS = 30 * 1000;

type ActiveSuggestion = Pick<
  RankedShortcutHint,
  "actionId" | "featureArea" | "id" | "reasonCode"
>;

let activeSuggestion: ActiveSuggestion | null = null;
const lastPresentationByKey = new Map<string, number>();

const suggestionProperties = (suggestion: ActiveSuggestion) => ({
  action_id: suggestion.actionId,
  feature_area: suggestion.featureArea,
  rank: 1,
  reason_code: suggestion.reasonCode,
  source: "sidebar_status",
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
    version: 1,
    actions: {
      ...current.actions,
      [actionId]: update(current.actions[actionId] ?? emptyUsage()),
    },
  };
  writeShortcutUsageProfile(next);
}

/**
 * Starts one visible sidebar-tip presentation. React remounts and short-lived
 * operational statuses can reveal the same tip repeatedly, so identical
 * presentations are locally deduplicated for 30 seconds.
 */
export function beginShortcutSuggestionPresentation(
  suggestion: ActiveSuggestion,
  now = Date.now(),
): () => void {
  activeSuggestion = suggestion;

  const dedupeKey = `${suggestion.id}:${suggestion.reasonCode}`;
  const lastPresentation = lastPresentationByKey.get(dedupeKey);
  if (
    lastPresentation === undefined ||
    now - lastPresentation >= PRESENTATION_DEDUPE_MS
  ) {
    lastPresentationByKey.set(dedupeKey, now);
    updateUsage(suggestion.actionId, (current) => {
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
      ...suggestionProperties(suggestion),
      outcome: "shown",
    });
  }

  return () => {
    if (activeSuggestion === suggestion) activeSuggestion = null;
  };
}

/** Records a successful taught shortcut outcome. This is deliberately called
 * from the outcome sites, not the raw keydown path. */
export function recordShortcutInvocation(
  hintId: ShortcutHintId,
  now = Date.now(),
): void {
  const hint = getShortcutHint(hintId);
  const engaged = activeSuggestion?.actionId === hint.actionId;
  updateUsage(hint.actionId, (current) => ({
    ...current,
    invocations: current.invocations + 1,
    lastInvokedAt: now,
  }));

  track("shortcut_invoked", {
    action_id: hint.actionId,
    feature_area: hint.featureArea,
    outcome: "succeeded",
    reason_code: "registered_shortcut",
    source: "keyboard",
  });

  if (engaged && activeSuggestion) {
    track("shortcut_suggestion_engaged", {
      ...suggestionProperties(activeSuggestion),
      outcome: "invoked",
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
  /** The hotkey as registered, never the raw key the user typed. */
  hotkey: RegisterableHotkey;
  /** The keydown/keyup that matched the registration. */
  event: Pick<
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
  attempt: ShortcutUnavailableAttempt,
): void {
  const hint = getShortcutHint(hintId);
  const { event } = attempt;
  track("shortcut_unavailable_attempt", {
    action_id: hint.actionId,
    active_element: document.activeElement?.tagName.toLowerCase() ?? "none",
    context: lockContext(),
    feature_area: hint.featureArea,
    is_repeat: event.repeat,
    outcome: "unavailable",
    reason_code: reasonCode,
    shortcut_key: registeredHotkeyLabel(attempt.hotkey),
    source: "keyboard",
    view: viewFromPathname(window.location.pathname),
    was_modifier_held:
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
  });
}

/** Test-only reset for module-level presentation dedupe state. */
export function resetShortcutTelemetryForTests(): void {
  activeSuggestion = null;
  lastPresentationByKey.clear();
}
