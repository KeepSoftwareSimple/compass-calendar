import { createElement } from "react";
import { type Id } from "react-toastify";
import { trackSignupStarted } from "@web/auth/posthog/signup-funnel";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { VIEW_TO_PARAM } from "@web/components/AuthModal/hooks/useAuthModal";
import {
  selectShowcaseActive,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";

const ANONYMOUS_SAVE_TOAST_ID: Id = "anonymous-save-toast";

function isAuthModalOpen(): boolean {
  if (typeof window === "undefined") return false;

  const auth = new URLSearchParams(window.location.search).get("auth");
  return Object.values(VIEW_TO_PARAM).includes(auth?.toLowerCase() ?? "");
}

/**
 * True while the Shortcut Showcase takeover is up. The toast is a distraction
 * there, not a removal: it's re-checked on every anonymous write, so a user
 * who skips onboarding entirely still sees it. The non-blocking first-event
 * prompt coexists with the toast on purpose - the prompt drives the create,
 * this toast catches the save-your-work moment right after.
 */
function isOnboardingFlowActive(): boolean {
  return selectShowcaseActive(useShortcutShowcaseStore.getState());
}

function hasSeenAnonymousSaveToast(): boolean {
  if (!persistentBrowserStore.isAvailable()) return true;
  return (
    persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_ANONYMOUS_SAVE_TOAST) ===
    "true"
  );
}

function markAnonymousSaveToastSeen(): void {
  persistentBrowserStore.set(
    STORAGE_KEYS.HAS_SEEN_ANONYMOUS_SAVE_TOAST,
    "true",
  );
}

interface AnonymousSaveToastProps {
  toastId: Id;
}

async function openSignUpFromOutsideRouter(): Promise<void> {
  const { router } = await import("@web/routers");
  router.navigate({
    to: ".",
    search: (prev: Record<string, unknown>) => ({
      ...prev,
      auth: VIEW_TO_PARAM.signUp,
    }),
  });
}

export const AnonymousSaveToast = ({ toastId }: AnonymousSaveToastProps) => {
  const handleSignUp = () => {
    trackSignupStarted("anon_nudge");
    void openSignUpFromOutsideRouter();
    getToast().dismiss(toastId);
  };

  return (
    <ToastNotice>
      <p className="text-sm text-text">
        Sign up to save your calendar across browsers.
      </p>
      <ToastActionButton onClick={handleSignUp}>Sign up</ToastActionButton>
    </ToastNotice>
  );
};

export function maybeShowAnonymousSaveToast(): void {
  if (isAuthModalOpen() || hasSeenAnonymousSaveToast()) return;
  // Don't mark seen here: onboarding suppresses this toast, not removes it,
  // so it still appears the first time a user writes an event after
  // skipping or finishing onboarding entirely.
  if (isOnboardingFlowActive()) return;

  markAnonymousSaveToastSeen();
  showStatusToast(
    ANONYMOUS_SAVE_TOAST_ID,
    createElement(AnonymousSaveToast, { toastId: ANONYMOUS_SAVE_TOAST_ID }),
  );
}
