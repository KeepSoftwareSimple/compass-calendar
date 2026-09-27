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

export const SHORTCUT_LEVELS: readonly ShortcutLevelDefinition[] = [
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
const FIRST_LEVEL = SHORTCUT_LEVELS[0];
if (FIRST_LEVEL?.minUsed !== 0) {
  throw new Error("SHORTCUT_LEVELS must start at minUsed: 0");
}

export function computeShortcutLevel(
  usedIds: ReadonlySet<string>,
  registryIds: readonly string[],
): ShortcutLevel {
  const used = registryIds.filter((id) => usedIds.has(id)).length;

  // minUsed: 0 on the first level guarantees at least one match, so
  // `currentIndex` is never -1.
  const currentIndex = SHORTCUT_LEVELS.reduce(
    (winner, definition, index) =>
      definition.minUsed <= used ? index : winner,
    0,
  );
  const current = SHORTCUT_LEVELS[currentIndex] ?? FIRST_LEVEL;
  const next = SHORTCUT_LEVELS[currentIndex + 1];

  return {
    level: current.level,
    name: current.name,
    used,
    total: registryIds.length,
    nextName: next?.name,
    remaining: next ? next.minUsed - used : undefined,
  };
}
