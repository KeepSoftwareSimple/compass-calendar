import { GithubLogoIcon } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import classNames from "classnames";
import { type ReactNode } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { SOCIAL_LINKS } from "@web/common/constants/social.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { flashedShortcutClass } from "./useFlashedWelcomeShortcut";

const SOCIAL_ICONS = {
  x: XLogoIcon,
  linkedin: LinkedinLogoIcon,
  github: GithubLogoIcon,
} as const;

const PRICING_LINK = {
  shortcut: "P",
  letter: "p",
  label: "Pricing",
  href: "https://www.compasscalendar.com/pricing",
} as const;

const PRACTICE_LINK = {
  label: "Practice the shortcuts",
  href: "?play=1",
} as const;

const DIGIT_LEGAL_LINKS = [
  {
    digit: "9",
    label: "Privacy",
    href: "https://www.compasscalendar.com/privacy",
  },
  {
    digit: "0",
    label: "Terms",
    href: "https://www.compasscalendar.com/terms",
  },
] as const;

function JumpAnchor({
  jumpIndex,
  letter,
  digit,
  href,
  label,
  flashedKey,
  className,
  children,
}: {
  jumpIndex?: number;
  letter?: string;
  digit: string;
  href: string;
  label?: string;
  flashedKey: string | null;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={className}
      data-welcome-jump={
        jumpIndex !== undefined ? String(jumpIndex) : undefined
      }
      data-welcome-letter={letter}
    >
      {children}
      <span
        className={classNames(
          "shrink-0",
          flashedShortcutClass(flashedKey, digit),
        )}
      >
        <ShortcutHint>{digit}</ShortcutHint>
      </span>
    </a>
  );
}

export function WelcomeLinks({ flashedKey }: { flashedKey: string | null }) {
  return (
    <div className="flex items-center justify-between border-border border-t pt-4">
      <div className="flex items-center gap-3">
        {SOCIAL_LINKS.map(({ id, label, href }, index) => {
          const SocialIcon = SOCIAL_ICONS[id];
          return (
            <JumpAnchor
              key={id}
              jumpIndex={index}
              digit={String(index + 6)}
              href={href}
              label={label}
              flashedKey={flashedKey}
              className="c-focus-ring inline-flex items-center gap-1 text-text-muted transition-colors hover:text-text"
            >
              <SocialIcon size={18} weight="bold" />
            </JumpAnchor>
          );
        })}
      </div>
      <div className="flex items-center gap-4 text-text-muted text-xs">
        <a
          href={ROOT_ROUTES.SHORTCUTS}
          className="c-focus-ring inline-flex items-center gap-1 underline-offset-4 hover:text-text hover:underline"
        >
          Shortcuts
        </a>
        <a
          href={PRACTICE_LINK.href}
          className="c-focus-ring inline-flex items-center gap-1 underline-offset-4 hover:text-text hover:underline"
        >
          {PRACTICE_LINK.label}
        </a>
        <JumpAnchor
          letter={PRICING_LINK.letter}
          digit={PRICING_LINK.shortcut}
          href={PRICING_LINK.href}
          flashedKey={flashedKey}
          className="c-focus-ring inline-flex items-center gap-1 underline-offset-4 hover:text-text hover:underline"
        >
          {PRICING_LINK.label}
        </JumpAnchor>
        {DIGIT_LEGAL_LINKS.map(({ digit, label, href }, index) => (
          <JumpAnchor
            key={label}
            jumpIndex={SOCIAL_LINKS.length + index}
            digit={digit}
            href={href}
            flashedKey={flashedKey}
            className="c-focus-ring inline-flex items-center gap-1 underline-offset-4 hover:text-text hover:underline"
          >
            {label}
          </JumpAnchor>
        ))}
      </div>
    </div>
  );
}
