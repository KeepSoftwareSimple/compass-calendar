import { type MouseEvent } from "react";

interface PublicBookingSkipLinkProps {
  href: string;
  label: string;
}

export function PublicBookingSkipLink({
  href,
  label,
}: PublicBookingSkipLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const id = href.startsWith("#") ? href.slice(1) : href;
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    event.preventDefault();
    target.focus();
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className="c-focus-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-30 focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-text"
    >
      {label}
    </a>
  );
}
