import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEmailPasswordPort } from "@web/auth/compass/hooks/emailpassword.port";
import { useCompleteAuthentication } from "@web/auth/compass/hooks/useCompleteAuthentication";
import {
  type ForgotPasswordFormData,
  type LogInFormData,
  type ResetPasswordFormData,
  type SignUpFormData,
} from "@web/auth/compass/schemas/auth.schemas";
import {
  trackSignupCompleted,
  trackSignupFailed,
  trackSignupStep,
} from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { shortcutShowcaseActions } from "@web/components/ShortcutShowcase/showcase.store";
import { getAuthSubmitErrorMessage } from "./useAuthFormHandlers.util";
import { type AuthView } from "./useAuthModal";

interface UseAuthFormHandlersOptions {
  currentView: AuthView;
  closeModal: () => void;
  authToken?: string;
  setView: (view: AuthView) => void;
}

export interface UseAuthFormHandlersResult {
  isSubmitting: boolean;
  submitError: string | null;
  handleSignUp: (data: SignUpFormData) => Promise<void>;
  handleLogin: (data: LogInFormData) => Promise<void>;
  handleForgotPassword: (data: ForgotPasswordFormData) => Promise<void>;
  handleResetPassword: (data: ResetPasswordFormData) => Promise<void>;
}

export function useAuthFormHandlers({
  currentView,
  closeModal,
  authToken,
  setView,
}: UseAuthFormHandlersOptions): UseAuthFormHandlersResult {
  const completeAuthentication = useCompleteAuthentication();
  const navigate = useNavigate();
  const search = useSearch({ from: "__root__" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: capture the token once, before handleResetPassword removes it from the URL on success.
  const initialAuthToken = useMemo(
    () => authToken || search.token || undefined,
    [authToken],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: submit errors should clear when the auth modal changes view.
  useEffect(() => {
    setSubmitError(null);
  }, [currentView]);

  const handleSignUp = useCallback(
    async (data: SignUpFormData) => {
      trackSignupStep("signup_form_submitted", { method: "email" });
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const response = await getEmailPasswordPort().signUp({
          // Same as signIn below: signing up is always a fresh identity, so
          // never link it to whatever session the browser still holds. A
          // stale cookie would otherwise attach the new account to it.
          shouldTryLinkingWithSessionUser: false,
          formFields: [
            { id: "name", value: data.name },
            { id: "email", value: data.email },
            { id: "password", value: data.password },
          ],
        });

        switch (response.status) {
          case "OK":
            await completeAuthentication({
              email: response.user.emails[0] ?? data.email,
            });
            trackSignupCompleted("email");
            closeModal();
            shortcutShowcaseActions.offerAfterSignupIfPending();
            return;
          case "FIELD_ERROR":
            trackSignupFailed("email_field_error", { method: "email" });
            setSubmitError(response.formFields[0]?.error ?? "Sign up failed");
            return;
          case "SIGN_UP_NOT_ALLOWED":
            trackSignupFailed("email_not_allowed", { method: "email" });
            setSubmitError(response.reason);
            return;
        }
      } catch (error) {
        trackSignupFailed("email_request_failed", { method: "email" });
        setSubmitError(getAuthSubmitErrorMessage(error, "Unable to sign up"));
      } finally {
        setIsSubmitting(false);
      }
    },
    [closeModal, completeAuthentication],
  );

  const handleLogin = useCallback(
    async (data: LogInFormData) => {
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const response = await getEmailPasswordPort().signIn({
          shouldTryLinkingWithSessionUser: false,
          formFields: [
            { id: "email", value: data.email },
            { id: "password", value: data.password },
          ],
        });

        switch (response.status) {
          case "OK":
            await completeAuthentication({
              email: response.user.emails[0] ?? data.email,
              onComplete: closeModal,
            });
            track("login_completed", { method: "email" });
            return;
          case "WRONG_CREDENTIALS_ERROR":
            setSubmitError("Incorrect email or password.");
            return;
          case "FIELD_ERROR":
            setSubmitError(response.formFields[0]?.error ?? "Log in failed");
            return;
          case "SIGN_IN_NOT_ALLOWED":
            setSubmitError(response.reason);
            return;
        }
      } catch (error) {
        setSubmitError(getAuthSubmitErrorMessage(error, "Unable to log in"));
      } finally {
        setIsSubmitting(false);
      }
    },
    [closeModal, completeAuthentication],
  );

  const handleForgotPassword = useCallback(
    async (data: ForgotPasswordFormData) => {
      setIsSubmitting(true);

      try {
        const response = await getEmailPasswordPort().sendPasswordResetEmail({
          formFields: [{ id: "email", value: data.email }],
        });

        switch (response.status) {
          case "OK":
            return;
          case "FIELD_ERROR":
            throw new Error(
              response.formFields[0]?.error ?? "Unable to send reset email",
            );
          case "PASSWORD_RESET_NOT_ALLOWED":
            throw new Error(response.reason);
        }
      } catch (error) {
        throw new Error(
          getAuthSubmitErrorMessage(error, "Unable to send reset email"),
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const handleResetPassword = useCallback(
    async (data: ResetPasswordFormData) => {
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        // `supertokens-web-js` reads the reset token from the URL query param
        // at call time, so the navigate must resolve before submitNewPassword
        // runs. We keep the first token we saw (from props or URL) so the
        // flow still works even if the URL changes.
        const token = initialAuthToken;

        if (token) {
          await navigate({
            to: ".",
            replace: true,
            search: (prev) => ({ ...prev, token }),
          });
        }
        const response = await getEmailPasswordPort().submitNewPassword({
          formFields: [{ id: "password", value: data.password }],
        });

        switch (response.status) {
          case "OK":
            await navigate({
              to: ".",
              replace: true,
              search: (prev) => {
                const { token: _token, ...rest } = prev;
                return rest;
              },
            });
            setView("loginAfterReset");
            return;
          case "FIELD_ERROR":
            setSubmitError(
              response.formFields[0]?.error ?? "Unable to reset password",
            );
            return;
          case "RESET_PASSWORD_INVALID_TOKEN_ERROR":
            setSubmitError(
              "This reset link is invalid or expired. Request a new one.",
            );
            return;
        }
      } catch (error) {
        setSubmitError(
          getAuthSubmitErrorMessage(error, "Unable to reset password"),
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [initialAuthToken, navigate, setView],
  );

  return {
    isSubmitting,
    submitError,
    handleSignUp,
    handleLogin,
    handleForgotPassword,
    handleResetPassword,
  };
}
