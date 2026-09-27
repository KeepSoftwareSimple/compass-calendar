import { type FC } from "react";
import {
  type ResetPasswordFormData,
  ResetPasswordSchema,
} from "@web/auth/compass/schemas/auth.schemas";
import { AuthButton } from "../components/AuthButton";
import { AuthInput } from "../components/AuthInput";
import { useZodForm } from "../hooks/useZodForm";

interface ResetPasswordFormProps {
  onSubmit: (data: ResetPasswordFormData) => void | Promise<void>;
  onBackToForgotPassword: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export const ResetPasswordForm: FC<ResetPasswordFormProps> = ({
  onSubmit,
  onBackToForgotPassword,
  isSubmitting,
  error,
}) => {
  const form = useZodForm({
    schema: ResetPasswordSchema,
    initialValues: { password: "" },
    onSubmit,
  });

  return (
    <form onSubmit={form.handleSubmit} className="flex w-full flex-col gap-4">
      <p className="text-center text-sm text-text-muted">
        Enter a new password for your account.
      </p>

      <AuthInput
        type="password"
        placeholder="New password"
        ariaLabel="New password"
        value={form.values.password}
        onChange={form.handleChange("password")}
        onBlur={form.handleBlur("password")}
        error={form.errors.password}
        hasError={!!form.touched.password && !!form.errors.password}
        autoComplete="new-password"
      />

      {error ? (
        <p className="text-center text-error text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <AuthButton
        type="submit"
        disabled={!form.isValid}
        isLoading={isSubmitting}
      >
        Set new password
      </AuthButton>

      <AuthButton type="button" variant="link" onClick={onBackToForgotPassword}>
        Back to forgot password
      </AuthButton>
    </form>
  );
};
