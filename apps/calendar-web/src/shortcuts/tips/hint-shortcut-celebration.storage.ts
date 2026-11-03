import {
  type HintShortcutCelebrationKey,
  mergeHintShortcutCelebrationKeys,
} from "@core/shortcuts/hint-shortcut-celebration.util";
import { type UserMetadata } from "@core/types/user.types";
import { UserApi } from "@web/api/user.api";
import { readAuthenticated } from "@web/auth/compass/session/auth-session.store";
import { useUserMetadataStore } from "@web/auth/state/user-metadata.store";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { readIdList, writeIdList } from "@web/common/storage/json-value.store";

export function readLocalHintShortcutCelebratedKeys(): readonly HintShortcutCelebrationKey[] {
  return readIdList(STORAGE_KEYS.SHORTCUT_HINT_FIRST_USED);
}

function readHintShortcutCelebratedKeysFromMetadata(
  metadata: UserMetadata | null | undefined,
): readonly HintShortcutCelebrationKey[] {
  return metadata?.shortcuts?.hintFirstUsed ?? [];
}

function writeLocalHintShortcutCelebratedKeys(
  keys: readonly HintShortcutCelebrationKey[],
): boolean {
  return writeIdList(STORAGE_KEYS.SHORTCUT_HINT_FIRST_USED, keys);
}

/** Device-local plus account keys when signed in and metadata is loaded. */
export function readEffectiveHintShortcutCelebratedKeys(): readonly HintShortcutCelebrationKey[] {
  const local = readLocalHintShortcutCelebratedKeys();
  if (!readAuthenticated()) return local;
  const metadata = useUserMetadataStore.getState().current;
  if (!metadata) return local;
  return mergeHintShortcutCelebrationKeys(
    local,
    readHintShortcutCelebratedKeysFromMetadata(metadata),
  );
}

export function hasHintShortcutBeenCelebrated(
  key: HintShortcutCelebrationKey,
): boolean {
  return readEffectiveHintShortcutCelebratedKeys().includes(key);
}

/**
 * Reserves this shortcut for a one-time celebration. Persists locally (and
 * queues account sync when signed in) before any animation can run.
 */
export function claimHintShortcutCelebration(
  key: HintShortcutCelebrationKey,
): boolean {
  if (hasHintShortcutBeenCelebrated(key)) return false;
  const merged = markHintShortcutCelebratedLocally(key);
  void persistHintShortcutCelebratedToAccount(merged);
  return true;
}

function markHintShortcutCelebratedLocally(
  key: HintShortcutCelebrationKey,
): readonly HintShortcutCelebrationKey[] {
  const next = mergeHintShortcutCelebrationKeys(
    readLocalHintShortcutCelebratedKeys(),
    [key],
  );
  writeLocalHintShortcutCelebratedKeys(next);
  return next;
}

/** Union device and account keys; writes local storage when the account adds keys. */
export function mergeHintShortcutCelebrationFromMetadata(
  metadata: UserMetadata,
): readonly HintShortcutCelebrationKey[] {
  const server = readHintShortcutCelebratedKeysFromMetadata(metadata);
  const merged = mergeHintShortcutCelebrationKeys(
    readLocalHintShortcutCelebratedKeys(),
    server,
  );
  writeLocalHintShortcutCelebratedKeys(merged);
  if (
    readAuthenticated() &&
    merged.length !== server.length &&
    merged.some((key) => !server.includes(key))
  ) {
    void persistHintShortcutCelebratedToAccount(merged);
  }
  return merged;
}

async function persistHintShortcutCelebratedToAccount(
  keys: readonly HintShortcutCelebrationKey[],
): Promise<void> {
  if (!readAuthenticated()) return;
  await UserApi.updateMetadata({
    shortcuts: { hintFirstUsed: [...keys] },
  });
}
