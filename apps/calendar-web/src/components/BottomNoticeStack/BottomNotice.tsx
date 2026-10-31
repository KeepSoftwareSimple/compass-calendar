import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import classNames from "classnames";
import { type HTMLAttributes, type ReactNode } from "react";
import { NoticePrimaryButton } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import IconButton from "@web/components/IconButton/IconButton";

/** Standard small UI copy (~13px), regular weight. */
export const BOTTOM_NOTICE_MESSAGE_CLASS =
  "min-w-0 flex-1 text-m font-normal leading-snug text-text line-clamp-2";

export const BOTTOM_NOTICE_PANEL_CLASS =
  "flex w-full flex-col gap-2 rounded-xl border border-border bg-surface/95 p-3 text-text shadow-[0_4px_12px_var(--color-shadow-default)] backdrop-blur-2xl backdrop-saturate-150";

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
            <div className="flex items-start gap-2">
              {message ? (
                <p className={BOTTOM_NOTICE_MESSAGE_CLASS}>{message}</p>
              ) : null}
              {showDismiss && onDismiss ? (
                <IconButton
                  aria-label={dismissAriaLabel}
                  className="-mt-0.5 shrink-0 text-text-muted hover:text-text"
                  onClick={onDismiss}
                  size="small"
                >
                  <XIcon aria-hidden="true" size={14} />
                </IconButton>
              ) : null}
            </div>
            {showPrimary && primaryLabel && onPrimary ? (
              <NoticePrimaryButton
                className="self-start"
                onClick={onPrimary}
                shortcutKeys={primaryShortcutKeys}
              >
                {primaryLabel}
              </NoticePrimaryButton>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
