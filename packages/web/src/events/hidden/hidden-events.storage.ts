import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { readIdList, writeIdList } from "@web/common/storage/json-value.store";

export function readHiddenEventIds(): readonly string[] {
  return readIdList(STORAGE_KEYS.HIDDEN_EVENT_IDS);
}

export function writeHiddenEventIds(ids: readonly string[]): boolean {
  return writeIdList(STORAGE_KEYS.HIDDEN_EVENT_IDS, ids);
}
