import classNames from "classnames";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { Z_INDEX_MODAL } from "@web/common/constants/web.constants";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { getFocusableElements } from "@web/common/utils/focusable-elements";
import { useOverlayEscape } from "@web/components/OverlayPanel/overlay-escape";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { pointerShortcutAttributes } from "@web/shortcuts/keyboard-only/pointer-action";

/** Stable, low-cardinality label for a panel's app-lock reason. */
function lockLabel(name: string | undefined): string {
  const slug = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return slug || "panel";
}

interface Props {
  /** Icon or element displayed at the top of the panel */
  icon?: ReactNode;
  /** Main title text */
  title?: string;
  /** Accessible name when the panel has no visible title */
  ariaLabel?: string;
  /** Optional content rendered on the same row as the title (e.g. a switch link) */
  titleAction?: ReactNode;
  /** Description/message text */
  message?: string;
  /** Additional content (buttons, etc.) */
  children?: ReactNode;
  /** Called when clicking the backdrop or pressing Escape */
  onDismiss?: () => void;
  /** Called when pressing Shift+Escape; falls back to onDismiss when omitted. */
  onShiftEscape?: () => void;
  /** Called when pressing Mod+Enter (Cmd/Ctrl+Enter). */
  onModEnter?: () => void;
  /** Focus this element on open instead of the first focusable in the panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Overrides the element that receives focus when the dialog closes. */
  restoreFocus?: () => void;
  /**
   * When `.current` is true at unmount, skip focus restore — for dialog-to-dialog
   * handoffs where the next dialog will seat focus itself.
   */
  skipFocusRestoreRef?: RefObject<boolean>;
  /** ARIA role for the panel (default: "dialog") */
  role?: "dialog" | "status" | "alert";
  /** Cross-axis alignment of the title/message/children (default: "center") */
  align?: "center" | "start";
  /** Panel style variant */
  variant?: "modal" | "status";
  /** Tailwind width class for the modal variant (default: "w-[400px]") */
  widthClassName?: string;
  /** Extra classes for the backdrop (e.g. overflow for tall dialogs) */
  backdropClassName?: string;
  /**
   * Backdrop cross-axis alignment. `"top"` pins the panel under a 5vh inset
   * so height changes grow downward instead of recentering.
   */
  anchor?: "center" | "top";
  /**
   * Replaces the modal variant's default gap/background/shadow so callers can
   * keep a surface-specific look without fighting those utilities.
   */
  panelClassName?: string;
  /** When true, applies dismiss-transition `data-closing` styles before unmount */
  closing?: boolean;
}

export const OverlayPanel = ({
  icon,
  title,
  ariaLabel,
  titleAction,
  message,
  children,
  onDismiss,
  onShiftEscape,
  onModEnter,
  initialFocusRef,
  restoreFocus,
  skipFocusRestoreRef,
  role = "dialog",
  align = "center",
  variant = "modal",
  widthClassName = "w-[400px]",
  backdropClassName,
  panelClassName,
  closing = false,
  anchor = "center",
}: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const messageId = `${baseId}-message`;
  // Unique per instance: app-lock reasons are a Set, not refcounted. The
  // title slug in the middle is what shortcut telemetry groups on.
  useAppLockReason(
    `overlayPanel:${lockLabel(title ?? ariaLabel)}:${baseId}`,
    true,
  );
  useOverlayEscape({ onDismiss, onShiftEscape });

  useEffect(() => {
    if (role !== "dialog") return;
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const [firstFocusable] = getFocusableElements(panel);
    const initialFocus = initialFocusRef?.current ?? firstFocusable ?? panel;
    initialFocus.focus();
    return () => {
      // Read at unmount so callers can suppress restore for dialog handoffs.
      if (skipFocusRestoreRef?.current) return;
      // Sync restore is safe: app-lock is still held during this cleanup
      // (registered before this effect), so document Escape consumers that
      // respect the lock stand down. OverlayPanel also stopPropagates Escape.
      if (restoreFocus) restoreFocus();
      else previouslyFocused?.focus?.();
    };
  }, [initialFocusRef, restoreFocus, role, skipFocusRestoreRef]);

  const backdropClasses = classNames(
    "fixed inset-0 flex justify-center bg-background/85 backdrop-blur-sm",
    anchor === "top" ? "items-start pt-[5vh]" : "items-center",
    variant === "modal" &&
      "transition-opacity duration-400 ease-out data-closing:opacity-0 motion-reduce:transition-none",
    backdropClassName,
  );

  const panelClasses = classNames(
    "flex flex-col",
    align === "start" ? "items-start" : "items-center",
    variant === "modal" && [
      widthClassName,
      "max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl will-change-transform",
      "transition-transform duration-400 ease-out data-closing:scale-105 motion-reduce:transition-none",
      panelClassName ??
        "gap-6 bg-surface-panel shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]",
    ],
    variant === "status" &&
      "max-w-sm gap-3 rounded-lg border border-border bg-surface/90 px-6 py-5 shadow-lg",
    variant === "status" && panelClassName,
  );

  const scrollBodyClasses = classNames(
    "flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto p-8",
    align === "start" ? "items-start" : "items-center",
  );

  const titleClasses = classNames(
    "m-0 line-clamp-2 w-full min-w-0 font-semibold text-lg text-text",
  );

  const messageClasses = classNames(
    "m-0 whitespace-pre-line text-base text-text",
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (onDismiss && e.target === e.currentTarget) {
      onDismiss();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (e.shiftKey && onShiftEscape) {
        e.preventDefault();
        e.stopPropagation();
        onShiftEscape();
        return;
      }
      if (onDismiss) {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onModEnter) {
      // Prevent the focused button (often Cancel) from activating on Enter.
      e.preventDefault();
      e.stopPropagation();
      onModEnter();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = getFocusableElements(panelRef.current);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const panelBody = (
    <>
      {icon}
      {title && (
        <div className="flex w-full items-center justify-between gap-3">
          {variant === "modal" ? (
            <h2 id={titleId} className={titleClasses}>
              {title}
            </h2>
          ) : (
            <div id={titleId} className={titleClasses}>
              {title}
            </div>
          )}
          {titleAction}
        </div>
      )}
      {message && (
        <p id={messageId} className={messageClasses}>
          {message}
        </p>
      )}
      {children}
    </>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The backdrop catches outside clicks, Tab/Mod+Enter, and in-tree Escape. Document Escape (useOverlayEscape) covers the case where focus is on body.
    <div
      className={backdropClasses}
      data-closing={closing || undefined}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="presentation"
      style={{ zIndex: Z_INDEX_MODAL }}
      tabIndex={-1}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-modal is only set when the panel role is dialog. */}
      <div
        ref={panelRef}
        className={panelClasses}
        data-closing={closing || undefined}
        role={role}
        tabIndex={role === "dialog" ? -1 : undefined}
        aria-modal={role === "dialog" ? true : undefined}
        aria-label={!title ? ariaLabel : undefined}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={message ? messageId : undefined}
        aria-live={role === "status" ? "polite" : undefined}
      >
        {variant === "modal" ? (
          <div className={scrollBodyClasses}>{panelBody}</div>
        ) : (
          panelBody
        )}
      </div>
    </div>
  );
};

interface OverlayPanelActionsProps {
  children: ReactNode;
  /** Horizontal alignment of the action buttons (default: "end") */
  align?: "start" | "end";
}

export const OverlayPanelActions = ({
  children,
  align = "end",
}: OverlayPanelActionsProps) => (
  <div
    className={classNames(
      "flex w-full gap-3",
      align === "start" ? "justify-start" : "justify-end",
    )}
  >
    {children}
  </div>
);

interface OverlayPanelActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  /** Visible keycap(s) for the action. */
  shortcut?: string | string[];
  /** When false, the shortcut still belongs to the action but the chip is hidden. */
  showShortcut?: boolean;
}

export const OverlayPanelActionButton = forwardRef<
  HTMLButtonElement,
  OverlayPanelActionButtonProps
>(function OverlayPanelActionButton(
  {
    children,
    className,
    shortcut,
    showShortcut = true,
    type = "button",
    variant = "secondary",
    onPointerEnter,
    ...buttonProps
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={classNames(
        "inline-flex items-center justify-center rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel disabled:pointer-events-none disabled:opacity-50",
        // The ghost variant skips the button box entirely so it reads as a
        // quiet link next to the real actions.
        variant !== "ghost" && "h-11 px-4",
        variant === "primary" &&
          "bg-accent font-medium text-on-accent transition hover:brightness-110",
        variant === "destructive" &&
          "bg-error text-on-accent transition hover:brightness-110",
        variant === "secondary" &&
          "border border-border bg-surface-overlay text-text transition-colors hover:bg-surface-panel",
        variant === "ghost" &&
          "text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline",
        className,
      )}
      type={type}
      onPointerEnter={(event) => {
        focusOnPointerEnter(event);
        onPointerEnter?.(event);
      }}
      {...buttonProps}
      {...(shortcut ? pointerShortcutAttributes(shortcut) : {})}
    >
      {children}
      {shortcut && showShortcut ? (
        <ShortcutKeys className="ml-2" keys={shortcut} />
      ) : null}
    </button>
  );
});
