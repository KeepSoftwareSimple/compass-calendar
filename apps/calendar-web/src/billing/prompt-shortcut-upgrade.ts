import { createElement } from "react";
import { type Id } from "react-toastify";
import { track } from "@web/auth/posthog/track";
import {
  getBillingWriteLockStatus,
  isBillingWriteLocked,
} from "@web/billing/billing-write-lock";
import { type CheckoutPanelSource } from "@web/billing/checkout-panel.store";
import { importOrReload } from "@web/common/utils/browser/missing-chunk-reload.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { hasAppLockReason } from "@web/shortcuts/app-lock";
import {
  getShortcutHint,
  type ShortcutFeatureArea,
  type ShortcutHintId,
  type ShortcutTipPart,
} from "@web/shortcuts/tips/shortcut-tips.data";

export const SHORTCUT_UPGRADE_TOAST_ID: Id = "shortcut-upgrade-toast";

const PRESENTATION_DEDUPE_MS = 30 * 1000;

export type ShortcutUpgradePromptSource = "keyboard" | "command_palette";

export type ShortcutUpgradePromptInput = {
  featureArea: ShortcutFeatureArea;
  actionId?: string;
  /** Names the exact key in the toast. Omit when only the feature area is
   * known (command palette, edit sequence). */
  hintId?: ShortcutHintId;
  source: ShortcutUpgradePromptSource;
};

type ShortcutUpgradeCopy = {
  parts?: readonly ShortcutTipPart[];
  title: string;
  cta: string;
};

let lastPresentationKey = "";
let lastPresentationAt = 0;

/** One sentence per hinted shortcut: what Premium unlocks, in the user's
 * terms. Shortcuts without a pitch fall back to the feature-area copy. */
const UPGRADE_PITCH: Partial<Record<ShortcutHintId, string>> = {
  "create-event":
    "Premium unlocks it, so you can block time the moment you think of it.",
  "edge-focus":
    "Premium unlocks it, so you can resize events to the minute without dragging.",
  nudge:
    "Premium unlocks it, so you can reschedule in seconds without touching the mouse.",
};

const promptCopy = (input: ShortcutUpgradePromptInput): ShortcutUpgradeCopy => {
  const status = getBillingWriteLockStatus();
  const cta = status === "awaiting_checkout" ? "Start trial" : "Subscribe";
  const pitch = input.hintId ? UPGRADE_PITCH[input.hintId] : undefined;
  if (input.hintId && pitch) {
    return { parts: getShortcutHint(input.hintId).parts, title: pitch, cta };
  }
  if (input.featureArea === "event_creation") {
    return {
      title:
        "Unlock event creation shortcuts with Premium. Upgrade in 30 seconds.",
      cta,
    };
  }
  return {
    title:
      "Unlock event editing shortcuts with Premium. Upgrade in 30 seconds.",
    cta,
  };
};

/**
 * Replaces the full-screen billing gate for a locked write shortcut: step
 * into look-around if the gate currently owns the screen, then show a
 * focused upgrade toast that stays on the calendar.
 */
export function promptShortcutUpgrade(
  input: ShortcutUpgradePromptInput,
  now = Date.now(),
): void {
  if (!isBillingWriteLocked()) return;

  if (hasAppLockReason("billingGate")) {
    enterBillingLookAround();
  }

  const copy = promptCopy(input);
  const presentationKey = `${input.featureArea}:${input.actionId ?? ""}:${input.source}`;
  if (
    presentationKey !== lastPresentationKey ||
    now - lastPresentationAt >= PRESENTATION_DEDUPE_MS
  ) {
    lastPresentationKey = presentationKey;
    lastPresentationAt = now;
    track("shortcut_upgrade_prompted", {
      feature_area: input.featureArea,
      source: input.source,
      ...(input.actionId ? { action_id: input.actionId } : {}),
    });
    track("billing_gate_shown", {
      status: getBillingWriteLockStatus() ?? "awaiting_checkout",
      surface: "shortcut_prompt",
    });
  }

  showUpgradeToast(copy, {
    kind: "shortcut_prompt",
    featureArea: input.featureArea,
    ...(input.actionId ? { actionId: input.actionId } : {}),
  });
}

/**
 * Lazy so this module can sit on the `useAppShortcut` hot path without a
 * boot-time cycle through toast CTAs (`ToastActionButton` →
 * `useNoticeActionShortcut` → `useAppShortcut`) or Google availability
 * (`billing-preview.store` → delayed/reconnect toasts → `AppConfigApi`).
 */
function enterBillingLookAround(): void {
  void importOrReload(() => import("@web/billing/billing-preview.store")).then(
    ({ billingPreviewActions }) => {
      billingPreviewActions.enter();
    },
  );
}

function showUpgradeToast(
  copy: ShortcutUpgradeCopy,
  checkoutSource: CheckoutPanelSource,
): void {
  void importOrReload(() => import("@web/billing/ShortcutUpgradeToast")).then(
    ({ ShortcutUpgradeToast }) => {
      showStatusToast(
        SHORTCUT_UPGRADE_TOAST_ID,
        createElement(ShortcutUpgradeToast, {
          toastId: SHORTCUT_UPGRADE_TOAST_ID,
          parts: copy.parts,
          title: copy.title,
          ctaLabel: copy.cta,
          checkoutSource,
        }),
      );
    },
  );
}

export function resetShortcutUpgradePromptForTests(): void {
  lastPresentationKey = "";
  lastPresentationAt = 0;
}
