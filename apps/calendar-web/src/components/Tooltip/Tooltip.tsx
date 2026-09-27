import { FloatingPortal, useMergeRefs } from "@floating-ui/react";
import classNames from "classnames";
import {
  cloneElement,
  forwardRef,
  type HTMLProps,
  isValidElement,
  type ReactNode,
  type Ref,
} from "react";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { type TooltipOptions } from "./tooltip.types";
import { TooltipContext, useTooltip, useTooltipContext } from "./useTooltip";

export function Tooltip({
  children,
  ...options
}: { children: ReactNode } & TooltipOptions) {
  // This can accept any props as options, e.g. `placement`,
  // or other positioning options.

  const tooltip = useTooltip(options);
  return (
    <TooltipContext.Provider value={tooltip}>
      {children}
    </TooltipContext.Provider>
  );
}

type TooltipTriggerProps = HTMLProps<HTMLElement> & {
  asChild?: boolean;
  "data-state"?: "open" | "closed";
};

export const TooltipTrigger = forwardRef<HTMLElement, TooltipTriggerProps>(
  function TooltipTrigger({ children, asChild = false, ...props }, propRef) {
    const context = useTooltipContext();

    const childrenRef = isValidElement(children)
      ? (children as { ref?: Ref<HTMLElement> }).ref
      : undefined;
    const ref = useMergeRefs([context.refs.setReference, propRef, childrenRef]);

    // `asChild` allows the user to pass any element as the anchor
    if (asChild && isValidElement<TooltipTriggerProps>(children)) {
      const childProps: TooltipTriggerProps = {
        ref,
        ...props,
        ...children.props,
        "data-state": context.open ? "open" : "closed",
      };
      return cloneElement(children, context.getReferenceProps(childProps));
    }

    return (
      <div
        ref={ref}
        data-state={context.open ? "open" : "closed"}
        {...context.getReferenceProps(props)}
      >
        {children}
      </div>
    );
  },
);

export const TooltipContent = forwardRef<
  HTMLDivElement,
  HTMLProps<HTMLDivElement>
>(function TooltipContent({ children, className, style, ...props }, propRef) {
  const context = useTooltipContext();
  const ref = useMergeRefs([context.refs.setFloating, propRef]);

  return (
    <FloatingPortal>
      {context.isMounted && (
        <div
          ref={ref}
          className={classNames("c-tooltip", className)}
          style={{
            left: context.x ?? 0,
            position: context.strategy,
            top: context.y ?? 0,
            visibility: context.x == null ? "hidden" : "visible",
            zIndex: Z_INDEX_TOOLTIP,
            ...context.transitionStyles,
            ...style,
          }}
          {...context.getFloatingProps(props)}
        >
          {children}
        </div>
      )}
    </FloatingPortal>
  );
});
