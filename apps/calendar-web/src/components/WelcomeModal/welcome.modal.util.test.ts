import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  markWelcomeSeen,
  readWelcomeExit,
  recordWelcomeExit,
} from "@web/components/WelcomeModal/welcome.modal.util";
import { afterEach, describe, expect, it } from "bun:test";

describe("welcome modal util storage", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.HAS_SEEN_WELCOME);
    persistentBrowserStore.remove(STORAGE_KEYS.WELCOME_EXIT);
  });

  it("records the exit CTA and reads it back", () => {
    markWelcomeSeen();
    recordWelcomeExit("explore");
    expect(readWelcomeExit()).toBe("explore");

    recordWelcomeExit("sign_up");
    expect(readWelcomeExit()).toBe("sign_up");
  });
});
