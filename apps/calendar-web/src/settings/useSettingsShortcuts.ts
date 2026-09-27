import { useEffect } from "react";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import { type SettingsPage } from "@web/settings/settings.store";
import { physicalDigitIndex } from "@web/shortcuts/digit-pick.util";
import {
  keyboardKey,
  normalizedKeyboardKey,
} from "@web/shortcuts/is-bare-letter-key";
import { useModHoldHintShortcut } from "@web/shortcuts/mod-hold/useModHoldHintShortcut";

export const SETTINGS_SHORTCUT_ATTR = "data-settings-shortcut";

export const settingsShortcutAttrs = (id: string) =>
  ({ [SETTINGS_SHORTCUT_ATTR]: id }) as const;

const clickSettingsShortcut = (id: string): boolean => {
  const el = document.querySelector<HTMLElement>(
    `[${SETTINGS_SHORTCUT_ATTR}="${id}"]`,
  );
  if (!el || el.hasAttribute("disabled")) return false;
  // Programmatic click does not move focus. Seat it on the target so a
  // following Enter activates this control instead of the previous one
  // (Accounts stays focused after 2, which would jump back).
  el.focus({ preventScroll: true });
  el.click();
  return true;
};

const isModEnter = (event: KeyboardEvent) =>
  keyboardKey(event) === "Enter" &&
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey;

/**
 * Maps a key to a Settings control. Nav digits 1/2 always win over in-page
 * actions so a user looking at Accounts can still jump to Billing. Disconnect
 * rows therefore have no digit shortcut (hover + Enter activates them).
 *
 * Booking save is Mod+Enter, matching the event form, so it still fires while
 * focus is in an input. OverlayPanel's onModEnter is not wired on Settings,
 * and should stay unwired: this capture-phase chord is the save path, and
 * both together would double-fire.
 */
const shortcutIdForEvent = (
  event: KeyboardEvent,
  page: SettingsPage,
  hasBilling: boolean,
  hasBooking: boolean,
): string | null => {
  const digit = physicalDigitIndex(event);
  if (digit === 0) return "nav-accounts";
  if (digit === 1)
    return hasBilling || page === "billing" ? "nav-billing" : null;
  if (digit === 2)
    return hasBooking || page === "booking" ? "nav-booking" : null;

  const key = normalizedKeyboardKey(event);
  if (page === "booking" && isModEnter(event)) return "save-booking";
  if (page === "billing") {
    if (key === "c") return "cancel-subscription";
    if (key === "r") return "resume-subscription";
    if (key === "u") return "update-card";
    return null;
  }
  if (page !== "accounts") return null;
  if (key === "a") return "add-account";
  if (key === "e") return "export";
  if (key === "d") return "delete-account";
  if (key === "o") return "log-out";
  return null;
};

/**
 * Page-local Settings shortcuts. Calendar letter keys are free while the
 * modal holds app-lock; chips appear on Mod down (no 600ms delay) so the
 * gesture matches the welcome modal rather than page-jump.
 */
export function useSettingsShortcuts({
  enabled,
  hasBilling,
  hasBooking,
  page,
}: {
  enabled: boolean;
  hasBilling: boolean;
  hasBooking: boolean;
  page: SettingsPage;
}): { areHintsVisible: boolean } {
  const { areHintsVisible } = useModHoldHintShortcut({
    enabled,
    holdMs: 0,
    ignoreAppLock: true,
    onModChord: (event) => {
      const id = shortcutIdForEvent(event, page, hasBilling, hasBooking);
      if (id) return clickSettingsShortcut(id);
      return false;
    },
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyboardTarget(event)) return;

      const id = shortcutIdForEvent(event, page, hasBilling, hasBooking);
      if (!id) return;

      event.preventDefault();
      event.stopPropagation();
      clickSettingsShortcut(id);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, hasBilling, hasBooking, page]);

  return { areHintsVisible };
}
