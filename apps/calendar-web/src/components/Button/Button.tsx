import classNames from "classnames";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type PropsWithChildren,
} from "react";
import { type CSSVariables } from "@web/common/styles/css.types";
import { theme } from "@web/common/styles/theme";
import { useEventPalette } from "@web/common/styles/theme.util";

// A native button (not a div) so Enter/Space activate it — click handlers
// often live on a wrapping TooltipTrigger div and rely on bubbling.
export const Btn = forwardRef<
  HTMLButtonElement,
  PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>
>(({ className, type = "button", ...props }, ref) => (
  <button
    {...props}
    type={type}
    className={classNames(
      "c-focus-ring flex cursor-pointer items-center justify-center rounded-xs",
      className,
    )}
    ref={ref}
  />
));

Btn.displayName = "Btn";

interface SaveButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "disabled"> {
  minWidth: number;
  disabled?: boolean;
}

export const SaveButton = forwardRef<
  HTMLButtonElement,
  PropsWithChildren<SaveButtonProps>
>(({ className, disabled, minWidth, style, ...props }, ref) => {
  // Per-theme, precomputed in theme.util — the hook subscription is what
  // repaints the button when the theme switches.
  // Fill goes through a CSS variable (not an inline `background`) so
  // hover:bg-background can override it. An inline background won over the
  // hover class and left text-muted on the event fill — ~1:1 in both themes.
  const { saveButtonBg, saveButtonShadow } = useEventPalette();
  const buttonStyle: CSSVariables = {
    ...style,
    "--save-button-bg": saveButtonBg,
    "--save-button-text-color": theme.getContrastText(saveButtonBg),
    "--elevated-shadow-color": saveButtonShadow,
    minWidth,
  };

  return (
    <Btn
      {...props}
      aria-disabled={disabled || undefined}
      className={classNames(
        "c-button-elevated min-w-39.5 bg-(--save-button-bg) px-2 text-(--save-button-text-color) transition-[background-color,color,box-shadow,transform] duration-500 hover:bg-background hover:text-text-muted",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      ref={ref}
      style={buttonStyle}
    />
  );
});

SaveButton.displayName = "SaveButton";
