import { type ChangeEvent, type FC, type Ref, useCallback } from "react";
import {
  type SignUpFormData,
  SignUpSchema,
} from "@web/auth/compass/schemas/auth.schemas";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { AuthButton } from "../components/AuthButton";
import { AuthInput } from "../components/AuthInput";
import { useZodForm } from "../hooks/useZodForm";

interface SignUpFormProps {
  /** Callback when form is submitted with valid data */
  onSubmit: (data: SignUpFormData) => void | Promise<void>;
  /** Callback when name field changes (for dynamic greeting) */
  onNameChange?: (name: string) => void;
  /** Whether form submission is in progress */
  isSubmitting?: boolean;
  /** Seats dialog focus on email so typing can start immediately. */
  emailInputRef?: Ref<HTMLInputElement>;
}

/**
 * Sign up form with name, email, and password fields
 *
 * Validates on blur and enables CTA only when all fields are valid
 */
export const SignUpForm: FC<SignUpFormProps> = ({
  onSubmit,
  onNameChange,
  isSubmitting,
  emailInputRef,
}) => {
  const form = useZodForm({
    schema: SignUpSchema,
    initialValues: { name: "", email: "", password: "" },
    onSubmit,
  });

  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      form.handleChange("name")(e);
      onNameChange?.(e.target.value);
    },
    [form.handleChange, onNameChange],
  );

  return (
    <form onSubmit={form.handleSubmit} className="flex w-full flex-col gap-4">
      <AuthInput
        type="text"
        placeholder="Name"
        ariaLabel="Name"
        value={form.values.name}
        onChange={handleNameChange}
        onBlur={form.handleBlur("name")}
        error={form.errors.name}
        hasError={!!form.touched.name && !!form.errors.name}
        autoComplete="name"
      />

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
        autoComplete="new-password"
      />

      <AuthButton
        type="submit"
        className="inline-flex items-center justify-center gap-2"
        disabled={!form.isValid}
        isLoading={isSubmitting}
      >
        Sign up
        <ShortcutHint className="shrink-0">Enter</ShortcutHint>
      </AuthButton>
    </form>
  );
};
