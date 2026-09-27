import { type FC, type Ref } from "react";
import {
  type LogInFormData,
  LogInSchema,
} from "@web/auth/compass/schemas/auth.schemas";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { AuthButton } from "../components/AuthButton";
import { AuthInput } from "../components/AuthInput";
import { useZodForm } from "../hooks/useZodForm";

interface SignInFormProps {
  /** Callback when form is submitted with valid data */
  onSubmit: (data: LogInFormData) => void | Promise<void>;
  /** Callback when "Forgot password" is clicked */
  onForgotPassword: () => void;
  /** Whether form submission is in progress */
  isSubmitting?: boolean;
  /** Optional status message shown above the form */
  statusMessage?: string | null;
  /** Seats dialog focus on email so typing can start immediately. */
  emailInputRef?: Ref<HTMLInputElement>;
}

/**
 * Sign in form with email and password fields
 *
 * Includes "Forgot password" link and validates on blur
 */
export const LogInForm: FC<SignInFormProps> = ({
  onSubmit,
  onForgotPassword,
  isSubmitting,
  statusMessage,
  emailInputRef,
}) => {
  const form = useZodForm({
    schema: LogInSchema,
    initialValues: { email: "", password: "" },
    onSubmit,
  });

  return (
    <form onSubmit={form.handleSubmit} className="flex w-full flex-col gap-4">
      {statusMessage ? (
        <p className="text-center text-sm text-success" role="status">
          {statusMessage}
        </p>
      ) : null}

      <AuthInput
        ref={emailInputRef}
        type="email"
        placeholder="Email"
        ariaLabel="Email"
        value={form.values.email}
        onChange={form.handleChange("email")}
        onBlur={form.handleBlur("email")}
        error={form.errors.email}
        hasError={!!form.touched.email && !!form.errors.email}
        autoComplete="email"
      />

      <AuthInput
        type="password"
        placeholder="Password"
        ariaLabel="Password"
        value={form.values.password}
        onChange={form.handleChange("password")}
        onBlur={form.handleBlur("password")}
        error={form.errors.password}
        hasError={!!form.touched.password && !!form.errors.password}
        autoComplete="current-password"
      />

      <div className="flex justify-end">
        <AuthButton type="button" variant="link" onClick={onForgotPassword}>
          Forgot password?
        </AuthButton>
      </div>

      <AuthButton
        type="submit"
        className="inline-flex items-center justify-center gap-2"
        disabled={!form.isValid}
        isLoading={isSubmitting}
      >
        Log in
        <ShortcutHint className="shrink-0">Enter</ShortcutHint>
      </AuthButton>
    </form>
  );
};
