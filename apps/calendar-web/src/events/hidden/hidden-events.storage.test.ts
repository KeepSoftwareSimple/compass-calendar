import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  readHiddenEventIds,
  writeHiddenEventIds,
} from "@web/events/hidden/hidden-events.storage";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  persistentBrowserStore.remove(STORAGE_KEYS.HIDDEN_EVENT_IDS);
});

describe("hidden-events.storage", () => {
  it("treats malformed JSON as empty", () => {
    persistentBrowserStore.set(STORAGE_KEYS.HIDDEN_EVENT_IDS, "{not-json");
    expect(readHiddenEventIds()).toEqual([]);
  });

  it("removes the key when writing an empty list", () => {
    writeHiddenEventIds(["evt-1"]);
    writeHiddenEventIds([]);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HIDDEN_EVENT_IDS),
    ).toBeNull();
  });
});
