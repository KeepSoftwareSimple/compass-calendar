import type React from "react";

export interface WeekDayProps {
  day: string;
  onClick: () => void;
  selected: boolean;
}

export const WeekDay = ({ day, onClick, selected }: WeekDayProps) => {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className="size-6 cursor-pointer rounded-full border border-[var(--border-strong)] bg-surface-overlay text-m text-text transition-all duration-300 focus:shadow-[0_0_0_2px_var(--border-strong)] data-[selected=true]:bg-accent data-[selected=true]:text-on-accent data-[selected=false]:hover:bg-background data-[selected=false]:hover:text-text-muted"
      data-selected={selected}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {day.charAt(0).toUpperCase()}
    </button>
  );
};
