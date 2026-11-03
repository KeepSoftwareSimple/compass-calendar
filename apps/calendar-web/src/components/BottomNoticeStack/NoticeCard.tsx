import classNames from "classnames";
import { type HTMLAttributes, type ReactNode } from "react";

export const NOTICE_CARD_INNER_CLASS =
  "flex w-full flex-col gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 text-text shadow-xl backdrop-blur-2xl backdrop-saturate-150";

export const NOTICE_CARD_INNER_OPAQUE_CLASS =
  "flex w-full flex-col gap-3 rounded-xl border border-border bg-surface-panel px-4 py-3 text-text shadow-xl";

export function NoticeCard({
  ariaLabel,
  children,
  closing,
  className,
  opaque = false,
  ...props
}: HTMLAttributes<HTMLElement> & {
  ariaLabel: string;
  children: ReactNode;
  closing?: boolean;
  /** Solid panel surface (no translucency over the grid). */
  opaque?: boolean;
}) {
  return (
    <aside
      {...props}
      aria-label={ariaLabel}
      className={classNames(
        "pointer-events-auto w-full transition-all duration-300 data-closing:opacity-0 motion-reduce:transition-none",
        !opaque && "starting:translate-y-2 starting:opacity-0",
        className,
      )}
      data-closing={closing || undefined}
      data-notice=""
    >
      <div
        className={
          opaque ? NOTICE_CARD_INNER_OPAQUE_CLASS : NOTICE_CARD_INNER_CLASS
        }
      >
        {children}
      </div>
    </aside>
  );
}
