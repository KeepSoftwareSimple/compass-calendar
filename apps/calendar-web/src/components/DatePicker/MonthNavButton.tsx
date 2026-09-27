import type React from "react";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

const MONTH_NAV_BUTTON_HOVER_COLOR = "rgba(255,255,255,0.2)";

type MonthNavButtonProps = {
  ariaLabel: string;
  children: React.ReactNode;
  color: string;
  isSidebarStyle?: boolean;
  onClick: () => void;
  shortcut?: string | string[];
};

export const MonthNavButton = ({
  ariaLabel,
  children,
  color,
  isSidebarStyle = false,
  onClick,
  shortcut,
}: MonthNavButtonProps) => {
  const button = (
    <button
      aria-label={ariaLabel}
      className="c-focus-ring"
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isSidebarStyle) return;

        e.currentTarget.style.backgroundColor = MONTH_NAV_BUTTON_HOVER_COLOR;
      }}
      onMouseLeave={(e) => {
        if (isSidebarStyle) return;

        e.currentTarget.style.backgroundColor = "transparent";
      }}
      onFocus={(e) => {
        if (isSidebarStyle) return;

        e.currentTarget.style.backgroundColor = MONTH_NAV_BUTTON_HOVER_COLOR;
      }}
      onBlur={(e) => {
        if (isSidebarStyle) return;

        e.currentTarget.style.backgroundColor = "transparent";
      }}
      style={{
        cursor: "pointer",
        color,
        background: "transparent",
        border: "1px solid transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "24px",
        height: "24px",
        borderRadius: isSidebarStyle ? "4px" : "50%",
        opacity: isSidebarStyle ? 0.9 : 1,
        transition: "background-color 0.2s, border-color 0.2s, opacity 0.2s",
      }}
      type="button"
    >
      {children}
    </button>
  );

  if (!shortcut) return button;

  return <TooltipWrapper shortcut={shortcut}>{button}</TooltipWrapper>;
};
