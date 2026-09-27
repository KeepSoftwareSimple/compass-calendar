import { type ChangeEvent, type FC, useState } from "react";
import {
  type ForgotPasswordFormData,
  ForgotPasswordSchema,
} from "@web/auth/compass/schemas/auth.schemas";
import { AuthButton } from "../components/AuthButton";
import { AuthInput } from "../components/AuthInput";
import { useZodForm } from "../hooks/useZodForm";

interface ForgotPasswordFormProps {
  /** Callback when form is submitted with valid data */
  onSubmit: (data: ForgotPasswordFormData) => void | Promise<void>;
  /** Callback when "Back to sign in" is clicked */
  onBackToSignIn: () => void;
  /** Whether form submission is in progress */
  isSubmitting?: boolean;
}

/**
 * Forgot password form with email field
 *
 * Shows a generic success message after submission to prevent
 * email enumeration attacks (always shows success, even if email not found)
 */
export const ForgotPasswordForm: FC<ForgotPasswordFormProps> = ({
  onSubmit,
  onBackToSignIn,
  isSubmitting,
}) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useZodForm({
    schema: ForgotPasswordSchema,
    initialValues: { email: "" },
    onSubmit: async (data) => {
      setSubmitError(null);

      try {
        await onSubmit(data);
        setIsSubmitted(true);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "Unable to send reset email",
        );
      }
    },
  });

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSubmitError(null);
    form.handleChange("email")(event);
  };

  if (isSubmitted) {
    return (
      <div className="flex w-full flex-col gap-4 text-center">
        <div className="text-text">
          <p className="mb-2 font-medium text-base">Check your email</p>
          <p className="text-sm text-text-muted">
            If an account exists for {form.values.email}, you will receive a
            password reset link shortly.
          </p>
        </div>
        <AuthButton type="button" variant="secondary" onClick={onBackToSignIn}>
          Back to sign in
        </AuthButton>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit} className="flex w-full flex-col gap-4">
      <p className="text-center text-sm text-text-muted">
        Enter your email address and we&apos;ll send you a link to reset your
        password.
      </p>

      <AuthInput
        type="email"
        placeholder="Email"
        ariaLabel="Email"
        value={form.values.email}
        onChange={handleEmailChange}
        onBlur={form.handleBlur("email")}
        error={form.errors.email}
        hasError={!!form.touched.email && !!form.errors.email}
        autoComplete="email"
      />
      {submitError ? (
        <p className="text-center text-error text-sm" role="alert">
          {submitError}
        </p>
      ) : null}

      <AuthButton
        type="submit"
        disabled={!form.isValid}
        isLoading={isSubmitting}
      >
        Send reset link
      </AuthButton>

      <AuthButton type="button" variant="link" onClick={onBackToSignIn}>
        Back to sign in
      </AuthButton>
    </form>
  );
};
