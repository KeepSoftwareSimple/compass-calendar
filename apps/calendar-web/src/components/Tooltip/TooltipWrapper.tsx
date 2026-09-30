import type React from "react";
import { type MouseEvent, type ReactNode } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";
import { type TooltipOptions } from "@web/components/Tooltip/tooltip.types";
import { pulseClickTaughtShortcut } from "@web/shortcuts/pointer-intent/pulse-click-taught-shortcut";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { ShortcutHint } from "../Shortcuts/ShortcutHint";
import { TooltipDescription } from "./Description/TooltipDescription";

type TooltipWrapperBaseProps = {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  placement?: TooltipOptions["placement"];
};

export type Props =
  | (TooltipWrapperBaseProps & {
      description?: string;
      shortcut?: undefined;
      shortcutId?: undefined;
    })
  | (TooltipWrapperBaseProps & {
      description: string;
      shortcut?: string | string[] | ReactNode;
      shortcutId?: ShortcutRegistryId;
    });

export const TooltipWrapper: React.FC<Props> = ({
  children,
  description,
  disabled = false,
  onClick,
  placement,
  shortcut,
  shortcutId,
}) => {
  const handleTriggerClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled) return;
    onClick?.();
    if (shortcutId && event.detail > 0) {
      pulseClickTaughtShortcut(shortcutId);
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
