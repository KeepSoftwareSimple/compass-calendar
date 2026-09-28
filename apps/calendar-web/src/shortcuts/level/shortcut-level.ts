/**
 * Shortcut level: how many distinct registry shortcuts this browser has used
 * at least once, against a fixed threshold table. No imports on purpose - the
 * registry is passed in by the caller so this file can never be pulled into
 * the hotkey registration path (that crashed week boot once, see #3821).
 */
export interface ShortcutLevelDefinition {
  level: number;
  name: string;
  /** Distinct registry shortcuts used to reach this level. */
  minUsed: number;
}

/**
 * The table is typed as a non-empty list whose first entry is reachable with
 * nothing used, so `computeShortcutLevel` always finds a current level
 * without a runtime guard for an empty or misordered table.
 */
export const SHORTCUT_LEVELS: readonly [
  ShortcutLevelDefinition & { minUsed: 0 },
  ...ShortcutLevelDefinition[],
] = [
  { level: 1, name: "Newcomer", minUsed: 0 },
  { level: 2, name: "Explorer", minUsed: 4 },
  { level: 3, name: "Navigator", minUsed: 10 },
  { level: 4, name: "Editor", minUsed: 20 },
  { level: 5, name: "Power user", minUsed: 35 },
  { level: 6, name: "Keyboard master", minUsed: 55 },
];

export interface ShortcutLevel {
  level: number;
  name: string;
  /** Distinct registry shortcuts used, intersected with the current registry. */
  used: number;
  /** Size of the registry passed in. */
  total: number;
  /** Absent at the top level. */
  nextName?: string;
  /** Distinct shortcuts still needed to reach `nextName`. Absent at the top level. */
  remaining?: number;
}

/**
 * `usedIds` may hold ids the current build no longer knows (a shipped id was
 * renamed or removed); those never count. `registryIds` is the caller's
 * current `SHORTCUTS_REGISTRY` id list.
 */
export function computeShortcutLevel(
  usedIds: ReadonlySet<string>,
  registryIds: readonly string[],
): ShortcutLevel {
  const used = registryIds.filter((id) => usedIds.has(id)).length;

  // The first level's `minUsed: 0` always matches, so the seed below is the
  // answer for a browser that has used nothing rather than a fallback.
  const current = SHORTCUT_LEVELS.reduce<ShortcutLevelDefinition>(
    (winner, definition) => (definition.minUsed <= used ? definition : winner),
    SHORTCUT_LEVELS[0],
  );
  // The first threshold this browser has not reached yet, which is the one
  // after `current` for a table whose thresholds only ever increase.
  const next = SHORTCUT_LEVELS.find((definition) => definition.minUsed > used);

  return {
    level: current.level,
    name: current.name,
    used,
    total: registryIds.length,
    nextName: next?.name,
    remaining: next ? next.minUsed - used : undefined,
  };
}
