import { type ComponentPropsWithoutRef, forwardRef } from "react";

type Props = ComponentPropsWithoutRef<"section">;

/**
 * Keyboard-focusable scroll container (WCAG 2.1.1 / axe
 * scrollable-region-focusable). Callers own overflow classes and any
 * focus-ring overlays.
 */
export const ScrollableRegion = forwardRef<HTMLElement, Props>(
  function ScrollableRegion({ children, ...props }, ref) {
    return (
      <section
        {...props}
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG 2.1.1 requires a scrollable region to be keyboard-focusable (axe's scrollable-region-focusable rule).
        tabIndex={0}
      >
        {children}
      </section>
    );
  },
);
