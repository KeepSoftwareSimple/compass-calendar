import {
  type ConflictBehavior,
  type RegisterableHotkey,
  useHotkey,
} from "@tanstack/react-hotkeys";
import { isBillingWriteLocked } from "@web/billing/billing-write-lock";
import { promptShortcutUpgrade } from "@web/billing/prompt-shortcut-upgrade";
import { hasAppLockReason, isAppLocked } from "@web/shortcuts/app-lock";
import { promptShortcutUnavailable } from "@web/shortcuts/prompt-shortcut-unavailable";
import { recordShortcutUnavailableAttempt } from "@web/shortcuts/tips/shortcut-telemetry";
import {
  getShortcutHint,
  type ShortcutFeatureArea,
  type ShortcutHintId,
} from "@web/shortcuts/tips/shortcut-tips.data";

export const WRITE_CREATE_SHORTCUT = {
  requiresWrite: true,
  upgradeFeatureArea: "event_creation",
} as const;

export const WRITE_EDIT_SHORTCUT = {
  requiresWrite: true,
  upgradeFeatureArea: "event_editing",
} as const;

export interface UseAppShortcutOptions {
  enabled?: boolean;
  ignoreInputs?: boolean;
  blurOnTrigger?: boolean;
  eventType?: "keydown" | "keyup";
  preventDefault?: boolean;
  stopPropagation?: boolean;
  /**
   * When true, the handler still runs while `document.body.dataset.appLocked`
   * is set. Use for the keys that open/close those locks (Mod+K, Shift+?,
   * Escape) so overlays remain dismissible from the keyboard.
   */
  ignoreAppLock?: boolean;
  /** Enables privacy-safe telemetry when this registered shortcut is blocked
   * by the app lock before its handler can run. */
  telemetryHintId?: ShortcutHintId;
  /**
   * When true, a billing-gated account gets a contextual upgrade prompt
   * instead of the handler (and instead of slamming the full billing gate).
   */
  requiresWrite?: boolean;
  /** Feature area for the upgrade prompt when `requiresWrite` is set. */
  upgradeFeatureArea?: ShortcutFeatureArea;
  /**
   * Shown when a non-billing overlay holds the app lock so the handler never
   * runs. Use for shortcuts whose silent no-op is confusing (Tab edge-focus
   * while a dialog owns the keyboard).
   */
  overlayUnavailableMessage?: string;
  /** @default 'allow' — multiple features often register the same global key (e.g. Escape). */
  conflictBehavior?: ConflictBehavior;
}

function promptLockedWriteShortcut(
  telemetryHintId: ShortcutHintId | undefined,
  upgradeFeatureArea: ShortcutFeatureArea | undefined,
): void {
  const hint = telemetryHintId ? getShortcutHint(telemetryHintId) : null;
  promptShortcutUpgrade({
    featureArea: upgradeFeatureArea ?? hint?.featureArea ?? "event_editing",
    actionId: hint?.actionId,
    hintId: telemetryHintId,
    source: "keyboard",
  });
}

export function useAppShortcut(
  hotkey: RegisterableHotkey,
  handler: (event: KeyboardEvent) => void,
  options: UseAppShortcutOptions = {},
) {
  const {
    enabled = true,
    ignoreInputs,
    blurOnTrigger = false,
    eventType = "keydown",
    preventDefault,
    stopPropagation,
    ignoreAppLock = false,
    telemetryHintId,
    requiresWrite = false,
    upgradeFeatureArea,
    overlayUnavailableMessage,
    conflictBehavior = "allow",
  } = options;

  // Omit undefined option keys so TanStack's setOptions cannot clobber
  // registration defaults (e.g. Mod shortcuts resolve ignoreInputs: false).
  useHotkey(
    hotkey,
    (event) => {
      if (!ignoreAppLock && isAppLocked()) {
        // The onboarding game owns these keys on purpose; its practice
        // presses are not attempts at an unavailable feature.
        if (telemetryHintId && !hasAppLockReason("shortcutShowcase")) {
          recordShortcutUnavailableAttempt(
            telemetryHintId,
            hasAppLockReason("billingGate") ? "billing_locked" : "overlay_open",
            { hotkey, event },
          );
        }
        if (
          requiresWrite &&
          isBillingWriteLocked() &&
          hasAppLockReason("billingGate")
        ) {
          promptLockedWriteShortcut(telemetryHintId, upgradeFeatureArea);
        } else if (
          overlayUnavailableMessage &&
          !hasAppLockReason("shortcutShowcase")
        ) {
          promptShortcutUnavailable(overlayUnavailableMessage);
        }
        return;
      }

      if (requiresWrite && isBillingWriteLocked()) {
        if (telemetryHintId) {
          recordShortcutUnavailableAttempt(telemetryHintId, "billing_locked", {
            hotkey,
            event,
          });
        }
        promptLockedWriteShortcut(telemetryHintId, upgradeFeatureArea);
        return;
      }

      if (blurOnTrigger) {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }

      handler(event);
    },
    {
      enabled,
      eventType,
      conflictBehavior,
      ...(ignoreInputs !== undefined ? { ignoreInputs } : {}),
      ...(preventDefault !== undefined ? { preventDefault } : {}),
      ...(stopPropagation !== undefined ? { stopPropagation } : {}),
    },
  );
}

export const useAppShortcutUp = (
  hotkey: RegisterableHotkey,
  handler: (event: KeyboardEvent) => void,
  options?: Omit<UseAppShortcutOptions, "eventType">,
) => useAppShortcut(hotkey, handler, { ...options, eventType: "keyup" });
