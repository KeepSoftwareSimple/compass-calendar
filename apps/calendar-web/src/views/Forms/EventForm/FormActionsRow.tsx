import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { X } from "@phosphor-icons/react/dist/csr/X";
import type React from "react";
import IconButton from "@web/components/IconButton/IconButton";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

export const EVENT_FORM_ACTIONS_ID = "event-form-actions";

interface Props {
  /** Unsaved create drafts have nothing persisted to copy. */
  isExistingEvent: boolean;
  /**
   * Read-only events can be inspected but not mutated, so Delete is hidden.
   * Duplicate stays: it creates a new, independent event. Close mutates nothing.
   */
  isReadOnly?: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

type ActionItem = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  shortcut: string | string[];
};

/**
 * Always-visible event-form action row above the title. Sits before the title
 * in the DOM so opening the form still lands on the title; Shift+Tab reaches
 * these actions. Each action is its own tab stop. Mod+0 jumps here.
 */
export const FormActionsRow: React.FC<Props> = ({
  isExistingEvent,
  isReadOnly = false,
  onClose,
  onDelete,
  onDuplicate,
}) => {
  const items: ActionItem[] = [];
  if (isExistingEvent) {
    items.push({
      icon: <Copy size={18} />,
      label: "Duplicate",
      onClick: onDuplicate,
      shortcut: ["Mod", "D"],
    });
  }
  if (!isReadOnly) {
    items.push({
      icon: <Trash size={18} />,
      label: "Delete",
      onClick: onDelete,
      shortcut: "Delete",
    });
  }
  items.push({
    icon: <X size={18} />,
    label: "Close",
    onClick: onClose,
    shortcut: "Esc",
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset's min-inline-size breaks the flex row; role="group" is the accessible equivalent
    <div
      aria-label="Event actions"
      className="flex items-center justify-end gap-1"
      id={EVENT_FORM_ACTIONS_ID}
      role="group"
    >
      {items.map((item) => (
        <TooltipWrapper
          key={item.label}
          description={item.label}
          shortcut={item.shortcut}
        >
          <IconButton
            aria-label={item.label}
            onClick={item.onClick}
            size="small"
          >
            {item.icon}
          </IconButton>
        </TooltipWrapper>
      ))}
    </div>
  );
};
