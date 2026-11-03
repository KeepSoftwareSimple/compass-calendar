import { hintShortcutCelebrationKeyForPart } from "@core/shortcuts/hint-shortcut-celebration.util";
import {
  selectHintShortcutCelebrationKey,
  useHintShortcutCelebrationStore,
} from "@web/shortcuts/tips/hint-shortcut-celebration.store";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export function hintShortcutCelebrationClassForPart(
  hintId: string | undefined,
  part: Exclude<ShortcutTipPart, string>,
  activeKey: string | null,
): string {
  if (!hintId || !activeKey) return "";
  const partKey = hintShortcutCelebrationKeyForPart(hintId, part);
  return partKey === activeKey ? "c-keycap-next" : "";
}

export function useHintShortcutCelebrationClass(
  hintId: string | undefined,
  part: Exclude<ShortcutTipPart, string>,
): string {
  const activeKey = useHintShortcutCelebrationStore(
    selectHintShortcutCelebrationKey,
  );
  return hintShortcutCelebrationClassForPart(hintId, part, activeKey);
}
