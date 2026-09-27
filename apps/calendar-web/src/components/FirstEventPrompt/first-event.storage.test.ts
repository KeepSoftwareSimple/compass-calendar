import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  getFirstEventDone,
  markFirstEventDone,
} from "@web/components/FirstEventPrompt/first-event.storage";
import { beforeEach, describe, expect, it } from "bun:test";

describe("first-event storage", () => {
  beforeEach(() => {
    persistentBrowserStore.set(STORAGE_KEYS.FIRST_EVENT_DONE, "");
  });

  it("is unset until marked", () => {
    expect(getFirstEventDone()).toBeNull();
  });

  it("persists completed and dismissed reasons", () => {
    markFirstEventDone("completed");
    expect(getFirstEventDone()).toBe("completed");

    markFirstEventDone("dismissed");
    expect(getFirstEventDone()).toBe("dismissed");
  });
});
