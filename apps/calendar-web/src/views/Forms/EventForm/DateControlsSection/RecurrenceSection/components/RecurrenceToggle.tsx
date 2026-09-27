import { useCallback } from "react";
import { RepeatIcon } from "@web/components/Icons/Repeat";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

export interface RecurrenceToggleProps {
  disabled?: boolean;
  disabledMessage?: string;
  hasRecurrence: boolean;
  toggleRecurrence: () => void;
}

export const RecurrenceToggle = ({
  disabled = false,
  disabledMessage,
  hasRecurrence,
  toggleRecurrence,
}: RecurrenceToggleProps) => {
  const onToggle = useCallback(() => {
    if (disabled) return;
    toggleRecurrence();
  }, [disabled, toggleRecurrence]);

  const toggle = (
    <button
      className="c-recurrence-toggle"
      aria-disabled={disabled || undefined}
      aria-label={hasRecurrence || disabled ? "Repeat" : "Edit recurrence"}
      data-repeat={hasRecurrence}
      data-disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <RepeatIcon size={18} />
      <span>Repeat</span>
    </button>
  );

  return (
    <div className="mb-1 flex w-full basis-full items-center gap-2 p-0">
      {disabled && disabledMessage ? (
        <TooltipWrapper description={disabledMessage}>{toggle}</TooltipWrapper>
      ) : (
        toggle
      )}
    </div>
  );
};
