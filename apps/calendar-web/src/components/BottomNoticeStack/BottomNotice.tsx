import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import classNames from "classnames";
import { type HTMLAttributes, type ReactNode } from "react";
import { NoticePrimaryButton } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import IconButton from "@web/components/IconButton/IconButton";

/** Secondary copy: same scale as sidebar countdown rows (`text-xs`). */
export const BOTTOM_NOTICE_MESSAGE_CLASS =
  "min-w-0 flex-1 text-xs leading-snug text-text-muted";

export const BOTTOM_NOTICE_PANEL_CLASS =
  "flex w-full flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border bg-surface/95 px-3 py-2.5 text-text shadow-xl backdrop-blur-2xl backdrop-saturate-150";

export function BottomNotice({
  ariaLabel,
  message,
  primaryLabel,
  onPrimary,
  primaryShortcutKeys,
  onDismiss,
  dismissAriaLabel = "Dismiss",
  closing,
  showPrimary = true,
  showDismiss = true,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  ariaLabel: string;
  message?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryShortcutKeys?: string | readonly string[];
  onDismiss?: () => void;
  dismissAriaLabel?: string;
  closing?: boolean;
  showPrimary?: boolean;
  showDismiss?: boolean;
  children?: ReactNode;
}) {
  return (
    <aside
      {...props}
      aria-label={ariaLabel}
      className={classNames(
        "pointer-events-auto w-full starting:translate-y-2 starting:opacity-0 transition-all duration-300 data-closing:opacity-0 motion-reduce:transition-none",
        className,
      )}
      data-closing={closing || undefined}
      data-notice=""
    >
      <div className={BOTTOM_NOTICE_PANEL_CLASS}>
        {children ?? (
          <>
            {message ? (
              <p className={BOTTOM_NOTICE_MESSAGE_CLASS}>{message}</p>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {showPrimary && primaryLabel && onPrimary ? (
                <NoticePrimaryButton
                  className="shrink-0 self-auto px-2.5 py-1"
                  onClick={onPrimary}
                  shortcutKeys={primaryShortcutKeys}
                >
                  {primaryLabel}
                </NoticePrimaryButton>
              ) : null}
              {showDismiss && onDismiss ? (
                <IconButton
                  aria-label={dismissAriaLabel}
                  className="shrink-0 text-text-muted hover:text-text"
                  onClick={onDismiss}
                  size="small"
                >
                  <XIcon aria-hidden="true" size={14} />
                </IconButton>
              ) : null}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
