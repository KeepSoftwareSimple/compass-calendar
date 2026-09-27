import classNames from "classnames";
import { forwardRef, type InputHTMLAttributes, useId } from "react";

interface AuthInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  /** Label text displayed above the input. Omit for placeholder-only style. */
  label?: string;
  /** Accessible name when label is hidden (required when label is omitted) */
  ariaLabel?: string;
  /** Error message to display below the input */
  error?: string;
  /** Whether the input is in an error state */
  hasError?: boolean;
}

/**
 * Styled input component for auth forms
 *
 * Features:
 * - Optional label (omit for placeholder-only style)
 * - Accessible via aria-label when label is hidden
 * - Error message display with proper aria attributes
 * - Tailwind styling consistent with app theme
 */
export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, ariaLabel, error, hasError, ...inputProps }, ref) => {
    const generatedId = useId();
    const inputId = inputProps.id || generatedId;
    const errorId = `${inputId}-error`;
    const showError = hasError && error;
    const showLabel = label != null;

    return (
      <div className="flex flex-col gap-1.5">
        {showLabel && (
          <label htmlFor={inputId} className="font-medium text-sm text-text">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={classNames(
            "border-border border-b bg-transparent py-2 text-base transition-colors",
            "text-text placeholder:text-text-subtle",
            "focus:border-accent focus:outline-none",
            {
              "border-error focus:border-error": showError,
            },
          )}
          aria-label={!showLabel ? ariaLabel : undefined}
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? errorId : undefined}
          {...inputProps}
        />
        {showError && (
          <span id={errorId} className="text-error text-sm" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  },
);

AuthInput.displayName = "AuthInput";
