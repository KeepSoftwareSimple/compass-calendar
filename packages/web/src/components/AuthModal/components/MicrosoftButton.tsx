import classNames from "classnames";
import type React from "react";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";

/**
 * Monochrome Microsoft four-square logo SVG, rendered in currentColor to
 * match the Google button's single-ink treatment.
 */
export const MicrosoftLogo = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M3 3h8v8H3V3z" fill="currentColor" />
    <path d="M13 3h8v8h-8V3z" fill="currentColor" />
    <path d="M3 13h8v8H3v-8z" fill="currentColor" />
    <path d="M13 13h8v8h-8v-8z" fill="currentColor" />
  </svg>
);

export const MicrosoftButton = ({
  onClick,
  disabled,
  label = "Connect Microsoft",
  shortcutKey,
  style,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  shortcutKey?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={classNames(
        "inline-flex h-10 items-center justify-center gap-2.5 whitespace-nowrap rounded-full border border-[#1f1f1f] bg-[#fff] px-3 font-medium text-[#1f1f1f] text-sm transition-[background-color,box-shadow,transform] duration-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "c-button-elevated cursor-pointer hover:bg-[#f8f8f8]",
      )}
      style={{
        fontFamily: "'Roboto', sans-serif",
        ...style,
      }}
    >
      <MicrosoftLogo size={18} />
      <span>{label}</span>
      {shortcutKey ? (
        <ShortcutHint className="shrink-0">{shortcutKey}</ShortcutHint>
      ) : null}
    </button>
  );
};
