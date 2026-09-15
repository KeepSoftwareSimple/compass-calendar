import { GithubLogoIcon } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import classNames from "classnames";
import { type ReactNode } from "react";
import { SOCIAL_LINKS } from "@web/common/constants/social.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { pointerShortcutAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
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
  href: "https://compasscalendar.com/pricing",
} as const;

const DIGIT_LEGAL_LINKS = [
  {
    digit: "9",
    label: "Privacy",
    href: "https://compasscalendar.com/privacy",
  },
  {
    digit: "0",
    label: "Terms",
    href: "https://compasscalendar.com/terms",
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
      {...pointerShortcutAttributes(digit)}
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
