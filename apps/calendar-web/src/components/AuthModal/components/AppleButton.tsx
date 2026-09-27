import classNames from "classnames";
import type React from "react";
import { AppleLogo } from "@web/components/Icons/AppleLogo";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";

export const AppleButton = ({
  onClick,
  disabled,
  busy,
  label = "Continue with Apple",
  shortcutKey,
  style,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  shortcutKey?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-label={label}
      className={classNames(
        "inline-flex h-10 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full border border-[#1f1f1f] bg-[#000] px-3 font-medium text-[#fff] text-sm transition-[background-color,box-shadow,transform] duration-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "c-button-elevated cursor-pointer hover:bg-[#1a1a1a]",
      )}
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        ...style,
      }}
    >
      <AppleLogo size={18} />
      <span>{label}</span>
      {shortcutKey ? (
        <ShortcutHint className="shrink-0">{shortcutKey}</ShortcutHint>
      ) : null}
    </button>
  );
};
