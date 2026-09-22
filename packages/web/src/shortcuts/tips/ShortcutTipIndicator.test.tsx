import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { ShortcutTipIndicator } from "@web/shortcuts/tips/ShortcutTipIndicator";
import { selectShortcutHint } from "@web/shortcuts/tips/selectShortcutHint";
import { resetShortcutTipsMutedStoreForTests } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { afterEach, describe, expect, it } from "bun:test";

describe("ShortcutTipIndicator", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
    resetShortcutTipsMutedStoreForTests();
  });

  it("mutes sidebar tips when Hide tips is pressed", async () => {
    const user = userEvent.setup();
    render(
      <ShortcutTipIndicator
        hint={
          selectShortcutHint({
            isFormOpen: false,
            isLifeView: false,
            eventFocused: false,
            firstEventDone: false,
          })!
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "Hide tips" }));

    expect(persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_TIPS_MUTED)).toBe(
      "true",
    );
  });
});
