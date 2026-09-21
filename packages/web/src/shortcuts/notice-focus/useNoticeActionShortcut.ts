import { useEffect } from "react";
import { isEventJumpActive } from "@web/shortcuts/shift-hint/event-jump.store";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import { isEditSequenceArmed } from "@web/shortcuts/useEditSequenceShortcut";

/** Action-toast CTA (Sign up / Sign in). Letter keys only: digits belong to
 * quick-time create (`1` = 1:00), except the series-scope toast which owns
 * 1/2 while it is visible. Same letter as the start-trial banner. Google
 * connection toasts use `CONNECTION_BANNER_SHORTCUT_KEY` instead so Refresh
 * and Reconnect never advertise two different letters. */
export const TOAST_PRIMARY_ACTION_KEY = "S" as const;

/** Start-trial banner CTA. Same letter as the billing gate overlay. */
export const START_TRIAL_SHORTCUT_KEY = "S" as const;

/** Google connection notice CTA (banner and toast: Reconnect / Retry /
 * Refresh). `G` matches Continue with Google on the welcome and auth
 * overlays. */
export const CONNECTION_BANNER_SHORTCUT_KEY = "G" as const;

/** Sample-events banner: `O` as in Okay. The banner has no button, so this
 * key is its only way off the screen. */
export const DEMO_EVENTS_BANNER_SHORTCUT_KEY = "O" as const;

export type NoticeActionKey =
  | typeof TOAST_PRIMARY_ACTION_KEY
  | typeof START_TRIAL_SHORTCUT_KEY
  | typeof CONNECTION_BANNER_SHORTCUT_KEY
  | typeof DEMO_EVENTS_BANNER_SHORTCUT_KEY;

const activeNoticeActionKeys = new Set<NoticeActionKey>();

/** True while some mounted notice (banner or toast) owns this key, so a
 * bare-letter shortcut using the same letter (e.g. go-to-date's `g`) can
 * stand down and let the notice handle it instead. */
export const isNoticeActionKeyActive = (key: NoticeActionKey): boolean =>
  activeNoticeActionKeys.has(key);

const canHandleNoticeAction = (event: KeyboardEvent) =>
  !event.isComposing &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !event.shiftKey &&
  !isEventJumpActive() &&
  !isEditSequenceArmed();

/**
 * Runs a mounted notice CTA (banner or toast) from a bare key. Yields to
 * typing, app-lock, event-jump, and an armed `e`… sequence — the same
 * stand-down as toast `S` and focus-notice `f`.
 */
export function useNoticeActionShortcut(
  key: NoticeActionKey | undefined,
  onClick: () => void,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(key) && (options.enabled ?? true);

  useEffect(() => {
    if (!key || !enabled) return;
    activeNoticeActionKeys.add(key);
    return () => {
      activeNoticeActionKeys.delete(key);
    };
  }, [key, enabled]);

  useAppShortcut(
    key ?? TOAST_PRIMARY_ACTION_KEY,
    (event) => {
      if (!canHandleNoticeAction(event)) return;
      onClick();
    },
    {
      enabled,
      ignoreInputs: true,
      preventDefault: true,
      stopPropagation: true,
    },
  );
}
