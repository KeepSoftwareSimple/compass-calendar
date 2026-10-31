import classNames from "classnames";
import { type HTMLAttributes, type ReactNode } from "react";

export const NOTICE_CARD_INNER_CLASS =
  "flex w-full flex-col gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 text-text shadow-xl backdrop-blur-2xl backdrop-saturate-150";

export function NoticeCard({
  ariaLabel,
  children,
  closing,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  ariaLabel: string;
  children: ReactNode;
  closing?: boolean;
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
      <div className={NOTICE_CARD_INNER_CLASS}>{children}</div>
    </aside>
  );
}
