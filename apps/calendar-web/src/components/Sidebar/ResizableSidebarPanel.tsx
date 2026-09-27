import classNames from "classnames";
import { type PropsWithChildren } from "react";
import { useCollapsiblePanel } from "@web/common/hooks/useCollapsiblePanel";
import { useResizableSidebar } from "@web/components/Sidebar/hooks/useResizableSidebar";
import {
  SIDEBAR_DIVIDER_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@web/components/Sidebar/storage/sidebar-width.constants";

interface Props extends PropsWithChildren {
  isOpen: boolean;
}

/**
 * Width-collapsing wrapper for the right sidebar that is also user-resizable
 * via a drag handle or the keyboard (arrows/Home/End/Enter). The panel and its
 * divider share one collapse transition, and a live drag disables that
 * transition so the width tracks the pointer 1:1.
 */
export function ResizableSidebarPanel({ children, isOpen }: Props) {
  const transition = useCollapsiblePanel(isOpen);
  const { width, isResizing, dividerProps } = useResizableSidebar();
  const animatesWidth = !isResizing;

  if (!transition.isMounted) {
    return null;
  }

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: An hr cannot host the focusable, draggable window-splitter interaction. */}
      <div
        {...dividerProps}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className={classNames(
          "group relative min-w-0 shrink-0 cursor-col-resize touch-none overflow-hidden focus:outline-none",
          {
            "transition-[width] duration-200 ease-out motion-reduce:transition-none":
              animatesWidth,
          },
        )}
        style={{ width: transition.isExpanded ? SIDEBAR_DIVIDER_WIDTH : 0 }}
      >
        <div
          className={classNames(
            "absolute inset-y-1 right-0 w-px rounded-full bg-border transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none",
            "group-hover:w-0.5 group-hover:bg-text/60",
            "group-focus-visible:w-1 group-focus-visible:bg-accent",
            { "w-0.5 bg-text/60": isResizing },
          )}
        />
      </div>

      <div
        className={classNames("h-full min-w-0 shrink-0 overflow-hidden", {
          "transition-[width] duration-200 ease-out motion-reduce:transition-none":
            animatesWidth,
        })}
        onTransitionEnd={transition.onTransitionEnd}
        style={{ width: transition.isExpanded ? width : 0 }}
      >
        {/* The content holds its full width even while the wrapper collapses to
            0, so overflow-hidden slides it out of view. */}
        <div className="h-full shrink-0" style={{ width }}>
          {children}
        </div>
      </div>
    </>
  );
}
