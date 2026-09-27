import {
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStyles,
} from "@floating-ui/react";
import { createContext, useContext, useMemo, useState } from "react";
import { type TooltipOptions } from "./tooltip.types";

export function useTooltip({
  initialOpen = false,
  placement = "top",
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  interactive = false,
}: TooltipOptions = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(initialOpen);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;

  const data = useFloating({
    placement,
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(5),
      flip({
        fallbackAxisSideDirection: "start",
        crossAxis: placement.includes("-"),
      }),
      shift({ padding: 5 }),
    ],
  });

  const context = data.context;

  // Memoized so the polygon tracker isn't rebuilt on every render — only when
  // `interactive` itself changes.
  const handleClose = useMemo(
    () => (interactive ? safePolygon() : null),
    [interactive],
  );
  const hover = useHover(context, {
    delay: 120,
    enabled: true,
    handleClose,
  });
  const focus = useFocus(context, {
    enabled: controlledOpen == null,
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const interactions = useInteractions([hover, focus, dismiss, role]);

  const transition = useTransitionStyles(context, {
    duration: { open: 160, close: 120 },
    initial: { opacity: 0, transform: "translateY(4px) scale(0.98)" },
    common: { transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" },
  });

  return useMemo(
    () => ({
      open,
      setOpen,
      isMounted: transition.isMounted,
      transitionStyles: transition.styles,
      ...interactions,
      ...data,
    }),
    [
      open,
      setOpen,
      transition.isMounted,
      transition.styles,
      interactions,
      data,
    ],
  );
}

export const TooltipContext = createContext<TooltipHookContext>(null);
export const useTooltipContext = () => {
  const context = useContext(TooltipContext);

  if (context == null) {
    throw new Error("Tooltip components must be wrapped in <Tooltip />");
  }

  return context;
};

export type TooltipHookContext = ReturnType<typeof useTooltip> | null;
