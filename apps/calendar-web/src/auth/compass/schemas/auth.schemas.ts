import { z } from "zod/v4";

/**
 * Email validation schema
 * - Required with meaningful error
 * - Validates email format
 * - Transforms to lowercase and trims whitespace
 *
 * Note: We use preprocess to trim/lowercase BEFORE validation so that
 * "  test@example.com  " validates correctly after trimming.
 */
export const EmailSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.trim().toLowerCase() : val),
  z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
);

/**
 * Password validation schema
 * - Required with meaningful error
 * - Minimum 8 characters for security
 */
export const PasswordSchema = z
  .string()
  .min(1, "Password is required")
  .min(8, "Password must be at least 8 characters");

/**
 * Name validation schema
 * - Required with meaningful error
 * - Trims whitespace
 *
 * Note: We use preprocess to trim BEFORE validation, then refine to check
 * that the trimmed result is non-empty (rejects whitespace-only strings).
 */
export const NameSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.trim() : val),
  z.string().min(1, "Name is required"),
);

/**
 * Sign up form schema
 * Combines name, email, and password validation
 */
export const SignUpSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  password: PasswordSchema,
});

/**
 * Sign in form schema
 * Email validation + password presence check (no min length on sign in)
 */
export const LogInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Password is required"),
});

/**
 * Forgot password form schema
 * Only requires valid email
 */
export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export const ResetPasswordSchema = z.object({
  password: PasswordSchema,
});

// Type exports for form data
export type SignUpFormData = z.infer<typeof SignUpSchema>;
export type LogInFormData = z.infer<typeof LogInSchema>;
export type ForgotPasswordFormData = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof ResetPasswordSchema>;
