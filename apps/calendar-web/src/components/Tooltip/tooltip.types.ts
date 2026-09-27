import { type Placement } from "@floating-ui/react";

export interface TooltipOptions {
  initialOpen?: boolean;
  placement?: Placement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Allows the pointer to travel from the trigger into the tooltip content, e.g. to click a button inside it. */
  interactive?: boolean;
}
