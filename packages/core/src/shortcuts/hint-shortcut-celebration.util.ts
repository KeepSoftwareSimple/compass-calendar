/** Stable id for a keycap group shown inside a shortcut hint (sidebar, form footer, etc.). */
export type HintShortcutCelebrationKey = string;

export type HintShortcutTipPart =
  | string
  | { key: string }
  | { keys: readonly string[] };

const spokenToken = (token: string): string => {
  if (token === "Mod") return "cmd";
  if (token === "Alt") return "alt";
  if (token === "Shift") return "shift";
  if (token === "Control") return "ctrl";
  if (token.length === 1) return token.toLowerCase();
  return token.toLowerCase();
};

const partTokens = (part: Exclude<HintShortcutTipPart, string>): string[] =>
  "keys" in part ? [...part.keys] : [part.key];

export const hintShortcutPartLabel = (
  part: Exclude<HintShortcutTipPart, string>,
): string => partTokens(part).map(spokenToken).join("+");

export function hintShortcutCelebrationKeyForPart(
  hintId: string,
  part: Exclude<HintShortcutTipPart, string>,
): HintShortcutCelebrationKey {
  return `${hintId}:${hintShortcutPartLabel(part)}`;
}

/** Builds `hintId:alt+arrowdown` style keys for each inline keycap group. */
export function listHintShortcutCelebrationKeys(
  hintId: string,
  parts: readonly HintShortcutTipPart[],
): HintShortcutCelebrationKey[] {
  const keys: HintShortcutCelebrationKey[] = [];
  for (const part of parts) {
    if (typeof part === "string") continue;
    keys.push(hintShortcutCelebrationKeyForPart(hintId, part));
  }
  return keys;
}

export function hintShortcutCelebrationKeyAtPartIndex(
  hintId: string,
  parts: readonly HintShortcutTipPart[],
  partIndex: number,
): HintShortcutCelebrationKey | null {
  const part = parts[partIndex];
  if (part === undefined || typeof part === "string") return null;
  return hintShortcutCelebrationKeyForPart(hintId, part);
}

export function firstHintShortcutCelebrationKey(
  hintId: string,
  parts: readonly HintShortcutTipPart[],
): HintShortcutCelebrationKey | null {
  for (let i = 0; i < parts.length; i += 1) {
    const key = hintShortcutCelebrationKeyAtPartIndex(hintId, parts, i);
    if (key) return key;
  }
  return null;
}

export function mergeHintShortcutCelebrationKeys(
  ...sets: readonly (readonly HintShortcutCelebrationKey[])[]
): HintShortcutCelebrationKey[] {
  const merged = new Set<HintShortcutCelebrationKey>();
  for (const set of sets) {
    for (const key of set) merged.add(key);
  }
  return [...merged];
}
