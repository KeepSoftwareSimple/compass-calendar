import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { readIdList, writeIdList } from "@web/common/storage/json-value.store";
import {
  isShortcutHintId,
  type ShortcutHintId,
} from "@web/shortcuts/tips/shortcut-tips.data";

// Most-recent-last list of demonstrated tip ids. Rotation uses the last
// entry; unused picks ignore order. An id this build no longer knows is
// dropped on read rather than treated as corruption.
export function readShortcutHintProgress(): readonly ShortcutHintId[] {
  return readIdList(STORAGE_KEYS.SHORTCUT_TIPS_DEMONSTRATED).filter(
    isShortcutHintId,
  );
}

export function writeShortcutHintProgress(
  ids: readonly ShortcutHintId[],
): boolean {
  return writeIdList(STORAGE_KEYS.SHORTCUT_TIPS_DEMONSTRATED, ids);
}
