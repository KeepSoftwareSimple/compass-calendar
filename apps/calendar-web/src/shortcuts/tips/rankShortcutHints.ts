import { type ShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import {
  getShortcutHint,
  type RankedShortcutHint,
  type ShortcutHintId,
  type ShortcutSuggestionReason,
} from "@web/shortcuts/tips/shortcut-tips.data";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SHORTCUT_FATIGUE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const SHORTCUT_FATIGUE_IMPRESSIONS = 2;
/** Invocations after which a shortcut counts as learned and stops being
 * taught, so the bar spends its one line on something the user has not
 * adopted yet. */
export const SHORTCUT_MASTERED_INVOCATIONS = 5;

type RankedCandidate = {
  fatigued: boolean;
  id: ShortcutHintId;
  score: number;
  untried: boolean;
};

function deterministicFallbackOrder(
  pool: readonly ShortcutHintId[],
  demonstratedIds: readonly ShortcutHintId[],
): readonly ShortcutHintId[] {
  const unused = pool.filter((id) => !demonstratedIds.includes(id));
  if (unused.length > 0) {
    return [...unused, ...pool.filter((id) => demonstratedIds.includes(id))];
  }

  const lastUsedId = demonstratedIds[demonstratedIds.length - 1];
  const lastIndex = lastUsedId ? pool.indexOf(lastUsedId) : -1;
  const start = (lastIndex + 1) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

function scoreCandidate(
  id: ShortcutHintId,
  demonstratedIds: readonly ShortcutHintId[],
  profile: ShortcutUsageProfile,
  now: number,
): RankedCandidate {
  const hint = getShortcutHint(id);
  const usage = profile.actions[hint.actionId];
  const invocations = usage?.invocations ?? 0;
  const untried = !demonstratedIds.includes(id) && invocations === 0;
  const lastInvokedAge = usage?.lastInvokedAt
    ? Math.max(0, now - usage.lastInvokedAt)
    : null;
  const lastShownAge = usage?.lastShownAt
    ? Math.max(0, now - usage.lastShownAt)
    : null;
  const fatigued =
    (usage?.recentImpressions ?? 0) >= SHORTCUT_FATIGUE_IMPRESSIONS &&
    lastShownAge !== null &&
    lastShownAge < SHORTCUT_FATIGUE_COOLDOWN_MS;

  let score = untried ? 80 : 0;
  score += Math.max(-24, 20 - invocations * 8);
  if (lastInvokedAge !== null && lastInvokedAge < DAY_MS) score -= 24;
  else if (lastInvokedAge !== null && lastInvokedAge < 7 * DAY_MS) score -= 12;
  else if (lastInvokedAge !== null && lastInvokedAge > 30 * DAY_MS) score += 12;
  if (fatigued) score -= 64;

  return { fatigued, id, score, untried };
}

function personalizedReason(
  selected: RankedCandidate,
  fallback: RankedCandidate,
): ShortcutSuggestionReason {
  if (selected.id === fallback.id) {
    return getShortcutHint(selected.id).suggestionReason;
  }
  if (fallback.fatigued) return "local_fatigue";
  if (selected.untried) return "local_discovery";
  return "local_recency";
}

/**
 * Ranks only the deterministic context pool. With no local history, the first
 * item is exactly the legacy deterministic pick. History adds four small,
 * explainable signals: mastered actions drop out of the pool entirely, and
 * untried actions, invocation recency, and repeated-tip fatigue score the
 * rest. The deterministic order remains the tie-breaker.
 */
export function rankShortcutHints(
  pool: readonly ShortcutHintId[],
  demonstratedIds: readonly ShortcutHintId[],
  profile: ShortcutUsageProfile,
  now = Date.now(),
): RankedShortcutHint {
  const unmastered = pool.filter((id) => {
    const usage = profile.actions[getShortcutHint(id).actionId];
    return (usage?.invocations ?? 0) < SHORTCUT_MASTERED_INVOCATIONS;
  });
  const fallbackOrder = deterministicFallbackOrder(
    unmastered.length > 0 ? unmastered : pool,
    demonstratedIds,
  );
  const candidates = fallbackOrder.map((id) =>
    scoreCandidate(id, demonstratedIds, profile, now),
  );
  const fallback = candidates[0];
  if (!fallback) {
    throw new Error("Shortcut hint pools must not be empty");
  }
  const selected = candidates.reduce((winner, candidate) =>
    candidate.score > winner.score ? candidate : winner,
  );

  return {
    ...getShortcutHint(selected.id),
    reasonCode: personalizedReason(selected, fallback),
  };
}
