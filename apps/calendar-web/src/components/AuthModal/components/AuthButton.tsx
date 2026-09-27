import classNames from "classnames";
import { type ButtonHTMLAttributes, type FC } from "react";

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant of the button */
  variant?: "primary" | "secondary" | "outline" | "link";
  /** Whether the button is in a loading state */
  isLoading?: boolean;
}

/**
 * Styled button component for auth forms
 *
 * Variants:
 * - primary: Solid accent color background (for CTAs)
 * - secondary: Subtle background (for secondary actions)
 * - outline: White background with dark border (matches Google button)
 * - link: Text-only style (for inline links like "Forgot password")
 */
export const AuthButton: FC<AuthButtonProps> = ({
  children,
  variant = "primary",
  isLoading,
  disabled,
  className,
  ...buttonProps
}) => {
  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      className={classNames(
        "rounded-3xl text-sm transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent",
        isDisabled ? "cursor-not-allowed" : "cursor-pointer",
        {
          // Primary variant
          "h-10 w-full bg-accent px-4 text-on-accent focus:ring-accent":
            variant === "primary",
          "c-button-elevated": variant === "primary" && !isDisabled,
          "hover:brightness-110": variant === "primary" && !isDisabled,
          "opacity-70": variant === "primary" && isDisabled,

          // Secondary variant
          "h-10 w-full bg-surface px-4 text-text": variant === "secondary",
          "hover:bg-bg-tertiary": variant === "secondary" && !isDisabled,

          // Outline variant (white/black, matches Google button)
          "h-10 w-full border border-[#1f1f1f] bg-text px-4 text-[#1f1f1f]":
            variant === "outline",
          "hover:border-[#151515] hover:bg-[#f0f0f0]":
            variant === "outline" && !isDisabled,

          // Link variant
          "px-0 py-0 text-text-muted hover:text-text": variant === "link",
          "hover:underline": variant === "link" && !isDisabled,
        },
        className,
      )}
      {...buttonProps}
    >
      {isLoading ? "Loading..." : children}
    </button>
  );
};
