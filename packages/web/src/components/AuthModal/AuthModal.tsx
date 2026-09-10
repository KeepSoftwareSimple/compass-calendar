import { DotIcon } from "@phosphor-icons/react";
import { useSearch } from "@tanstack/react-router";
import {
  type FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { consumeGoogleAuthNeedsConsentRetry } from "@web/auth/providers/authorization/provider-authorization.storage";
import { signInProviderForShortcutLetter } from "@web/auth/providers/sign-in-provider.util";
import { useSignInProviders } from "@web/auth/providers/useSignInProviders";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import {
  dismissErrorToast,
  SESSION_EXPIRED_TOAST_ID,
} from "@web/common/utils/toast/error-toast.util";
import { SignInProviderButtons } from "@web/components/AuthModal/components/SignInProviderButtons";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { keyboardKey } from "@web/shortcuts/is-bare-letter-key";
import { ForgotPasswordForm } from "./forms/ForgotPasswordForm";
import { LogInForm } from "./forms/LogInForm";
import { ResetPasswordForm } from "./forms/ResetPasswordForm";
import { SignUpForm } from "./forms/SignUpForm";
import { useAuthFormHandlers } from "./hooks/useAuthFormHandlers";
import {
  type AuthSearch,
  type AuthView,
  useAuthModal,
} from "./hooks/useAuthModal";

function getInitialAuthToken(search: AuthSearch): string | undefined {
  const authParam = search.auth?.toLowerCase();

  if (authParam !== "reset") {
    return undefined;
  }

  return search.token;
}

/**
 * Authentication modal with Sign In, Sign Up, and Forgot Password views
 *
 * Features:
 * - Tab navigation between Sign In and Sign Up
 * - Google OAuth integration via redirect-based Google login hook
 * - Email/password forms with Zod validation
 * - Forgot password flow with generic success message
 * - Accessible modal with proper ARIA attributes
 */
export const AuthModal: FC = () => {
  const { isOpen, currentView, closeModal, setView } = useAuthModal();
  useAppLockReason("authModal", isOpen);
  const handleGoogleAuthStart = useCallback(() => {
    dismissErrorToast(SESSION_EXPIRED_TOAST_ID);
  }, []);
  // Consumed once per fresh mount (i.e. once per return from a failed
  // attempt): Google withholds a refresh token on a repeat consent, so a
  // signup that failed after Google-side consent but before Compass finished
  // linking would otherwise fail the exact same way on every retry, forever.
  const [needsConsentRetry] = useState(consumeGoogleAuthNeedsConsentRetry);
  const { available, isLoading, loadingKind, startSignIn } = useSignInProviders(
    {
      google: {
        onStart: handleGoogleAuthStart,
        prompt: needsConsentRetry ? "consent" : undefined,
      },
    },
  );
  const isLoginView =
    currentView === "login" || currentView === "loginAfterReset";
  const search = useSearch({ from: "__root__" });
  const [authToken] = useState(() => getInitialAuthToken(search));
  const {
    isSubmitting,
    submitError,
    handleSignUp,
    handleLogin,
    handleForgotPassword,
    handleResetPassword,
  } = useAuthFormHandlers({
    currentView,
    closeModal,
    authToken,
    setView,
  });

  const [signUpName, setSignUpName] = useState("");
  // Counted once per view no matter how often the modal is closed and
  // reopened, matching how WelcomeModal dedupes its own step events.
  const openedViewsRef = useRef(new Set<AuthView>());
  const prevViewRef = useRef(currentView);
  // OverlayPanel would otherwise seat the view-switch chip (first focusable).
  const emailInputRef = useRef<HTMLInputElement>(null);
  const pricingLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isOpen || currentView !== "signUp") return;
    if (openedViewsRef.current.has(currentView)) return;
    openedViewsRef.current.add(currentView);
    trackSignupStep("auth_modal_opened", { method: "email" });
  }, [currentView, isOpen]);

  useEffect(() => {
    if (prevViewRef.current !== "signUp" && currentView === "signUp") {
      setSignUpName("");
    }
    prevViewRef.current = currentView;
  }, [currentView]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    if (
      currentView !== "login" &&
      currentView !== "loginAfterReset" &&
      currentView !== "signUp"
    ) {
      return;
    }
    emailInputRef.current?.focus();
  }, [currentView, isOpen]);

  const handleSwitchAuth = useCallback(
    () => setView(currentView === "signUp" ? "login" : "signUp"),
    [currentView, setView],
  );

  const handleProviderSignIn = useCallback(
    (kind: ProviderKind) => {
      startSignIn(kind);
      closeModal();
    },
    [closeModal, startSignIn],
  );

  const navigateToForgotPassword = useCallback(() => {
    setView("forgotPassword");
  }, [setView]);

  const handleBackToSignIn = useCallback(() => {
    setView("login");
  }, [setView]);

  const handleBackToForgotPassword = useCallback(() => {
    setView("forgotPassword");
  }, [setView]);

  const showAuthSwitch = isLoginView || currentView === "signUp";

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyboardTarget(event)) return;
      const key = keyboardKey(event).toLowerCase();
      if (key === "p") {
        event.preventDefault();
        pricingLinkRef.current?.click();
        return;
      }
      if (!showAuthSwitch) return;
      const providerKind = signInProviderForShortcutLetter(key, available);
      if (providerKind) {
        event.preventDefault();
        handleProviderSignIn(providerKind);
        return;
      }
      if (key === "u" && isLoginView) {
        event.preventDefault();
        setView("signUp");
        return;
      }
      if (key === "i" && currentView === "signUp") {
        event.preventDefault();
        setView("login");
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    available,
    currentView,
    handleProviderSignIn,
    isLoginView,
    isOpen,
    setView,
    showAuthSwitch,
  ]);

  if (!isOpen) {
    return null;
  }

  const showProviderSignIn =
    currentView !== "resetPassword" && available.length > 0;
  const showSubmitError =
    submitError !== null && (isLoginView || currentView === "signUp");
  const trimmedName = signUpName.trim();
  const title =
    currentView === "forgotPassword"
      ? "Reset Password"
      : currentView === "resetPassword"
        ? "Set New Password"
        : currentView === "signUp"
          ? trimmedName
            ? `Nice to meet you, ${trimmedName}`
            : "Nice to meet you"
          : "Hey, welcome back";

  return (
    <OverlayPanel
      title={title}
      titleAction={
        showAuthSwitch ? (
          <button
            type="button"
            onClick={handleSwitchAuth}
            className="inline-flex shrink-0 items-center gap-2 rounded-3xl bg-[#c2c6cc] px-4 py-1.5 text-[#1f1f1f] text-xs transition-all hover:bg-[#d1d5da]"
          >
            {isLoginView ? "Sign up" : "Log in"}
            <ShortcutHint className="shrink-0">
              {isLoginView ? "U" : "i"}
            </ShortcutHint>
          </button>
        ) : null
      }
      initialFocusRef={emailInputRef}
      onDismiss={closeModal}
      variant="modal"
      widthClassName="w-120"
    >
      <div className="flex w-full flex-col gap-6">
        {/* Form based on current view */}
        {currentView === "signUp" && (
          <SignUpForm
            onSubmit={handleSignUp}
            onNameChange={setSignUpName}
            isSubmitting={isSubmitting}
            emailInputRef={emailInputRef}
          />
        )}
        {isLoginView && (
          <LogInForm
            onSubmit={handleLogin}
            onForgotPassword={navigateToForgotPassword}
            isSubmitting={isSubmitting}
            emailInputRef={emailInputRef}
            statusMessage={
              currentView === "loginAfterReset"
                ? "Password reset successful. Log in with your new password."
                : null
            }
          />
        )}
        {currentView === "forgotPassword" && (
          <ForgotPasswordForm
            onSubmit={handleForgotPassword}
            onBackToSignIn={handleBackToSignIn}
            isSubmitting={isSubmitting}
          />
        )}
        {currentView === "resetPassword" && (
          <ResetPasswordForm
            onSubmit={handleResetPassword}
            onBackToForgotPassword={handleBackToForgotPassword}
            isSubmitting={isSubmitting}
            error={submitError}
          />
        )}
        {showSubmitError ? (
          <p className="text-center text-error text-sm" role="alert">
            {submitError}
          </p>
        ) : null}
        {/* Google Sign In - at bottom */}
        {showProviderSignIn ? (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-sm text-text-muted">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <SignInProviderButtons
              available={available}
              loadingKind={isLoading ? loadingKind : null}
              onSignIn={handleProviderSignIn}
            />
          </>
        ) : null}
        {currentView === "signUp" ? (
          <p className="text-center text-text-muted text-xs">
            Signing up also gets you occasional product emails. Unsubscribe
            anytime.
          </p>
        ) : null}
        <div className="flex w-full justify-center">
          <button
            type="button"
            onClick={closeModal}
            className="c-focus-ring inline-flex items-center rounded-md px-2 py-1 text-text-muted text-xs hover:bg-surface-overlay hover:text-text"
          >
            Back
            <ShortcutHint className="ml-2">Esc</ShortcutHint>
          </button>
        </div>
        <div className="flex items-center justify-center text-center text-text-muted text-xs">
          <a
            ref={pricingLinkRef}
            href="https://compasscalendar.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-text hover:underline"
          >
            Pricing
            <ShortcutHint>P</ShortcutHint>
          </a>
          <DotIcon size={26} />
          <a
            href="https://www.compasscalendar.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text hover:underline"
          >
            Terms
          </a>
          <DotIcon size={26} />
          <a
            href="https://www.compasscalendar.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text hover:underline"
          >
            Privacy
          </a>
        </div>
      </div>
    </OverlayPanel>
  );
};
