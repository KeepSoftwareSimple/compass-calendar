import type React from "react";
import { type MouseEvent, type ReactNode } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";
import { type TooltipOptions } from "@web/components/Tooltip/tooltip.types";
import { pulseClickTaughtShortcut } from "@web/shortcuts/pointer-intent/pulseClickTaughtShortcut";
import { isRealMouseClick } from "@web/shortcuts/pointer-intent/real-mouse-click";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { ShortcutHint } from "../Shortcuts/ShortcutHint";
import { TooltipDescription } from "./Description/TooltipDescription";

type TooltipWrapperBaseProps = {
  children: ReactNode;
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  placement?: TooltipOptions["placement"];
  shortcutId?: ShortcutRegistryId;
};

type TooltipWrapperWithoutShortcut = TooltipWrapperBaseProps & {
  shortcut?: undefined;
  description?: string;
};

type TooltipWrapperWithShortcut = TooltipWrapperBaseProps & {
  /** One key (`"?"`) or a combo as a key array (`["Mod", "K"]`); a custom node is rendered as-is. */
  shortcut: string | string[] | ReactNode;
  description: string;
};

export type Props = TooltipWrapperWithoutShortcut | TooltipWrapperWithShortcut;

export const TooltipWrapper: React.FC<Props> = (props) => {
  const {
    children,
    description,
    disabled = false,
    onClick,
    placement,
    shortcut,
    shortcutId,
  } = props;

  const handleTriggerClick = (event: MouseEvent<HTMLElement>) => {
    if (!disabled && shortcutId && isRealMouseClick(event)) {
      pulseClickTaughtShortcut(shortcutId);
    }
    if (!disabled) {
      onClick?.(event);
    }
  };

  return (
    <Tooltip placement={placement}>
      <TooltipTrigger
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : handleTriggerClick}
      >
        {children}
      </TooltipTrigger>

      <TooltipContent>
        <div className="flex items-center">
          {description && <TooltipDescription description={description} />}
          {shortcut &&
            (typeof shortcut === "string" || Array.isArray(shortcut) ? (
              <ShortcutKeys keys={shortcut} />
            ) : (
              <ShortcutHint variant="keycap">{shortcut}</ShortcutHint>
            ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
