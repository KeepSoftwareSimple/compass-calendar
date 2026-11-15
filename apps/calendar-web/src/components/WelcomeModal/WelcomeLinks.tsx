import { GithubLogoIcon } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import classNames from "classnames";
import { type ReactNode } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { SOCIAL_LINKS } from "@web/common/constants/social.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { FAQ_ITEMS } from "./faq";
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
    label: "Privacy",
    href: "https://www.compasscalendar.com/privacy",
  },
  {
    label: "Terms",
    href: "https://www.compasscalendar.com/terms",
  },
] as const;

/** Footer jump indices for Privacy/Terms digit keys (after the FAQ digits). */
const PRIVACY_JUMP_INDEX = 3;
const TERMS_JUMP_INDEX = 4;

/**
 * The digit key that activates footer link `jumpIndex`: the digits after the
 * FAQ rows, with 0 last. Links past 0 have no key and are plain links.
 */
function footerDigit(jumpIndex: number): string | undefined {
  const position = FAQ_ITEMS.length + jumpIndex + 1;
  return position > 10 ? undefined : String(position % 10);
}

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
  digit?: string;
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
      {digit && (
        <span
          className={classNames(
            "shrink-0",
            flashedShortcutClass(flashedKey, digit),
          )}
        >
          <ShortcutHint>{digit}</ShortcutHint>
        </span>
      )}
    </a>
  );
}

type WelcomeLinksProps = {
  flashedKey: string | null;
  /** Account-choice screen: Pricing, Privacy, and Terms only. */
  variant?: "guide" | "accountChoice";
};

export function WelcomeLinks({
  flashedKey,
  variant = "guide",
}: WelcomeLinksProps) {
  const linkClassName =
    "c-focus-ring inline-flex shrink-0 items-center gap-1 whitespace-nowrap underline-offset-4 hover:text-text hover:underline";

  if (variant === "accountChoice") {
    return (
      <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 border-border border-t pt-3 text-text-muted text-xs">
        <JumpAnchor
          letter={PRICING_LINK.letter}
          digit={PRICING_LINK.shortcut}
          href={PRICING_LINK.href}
          flashedKey={flashedKey}
          className={linkClassName}
        >
          {PRICING_LINK.label}
        </JumpAnchor>
        {DIGIT_LEGAL_LINKS.map(({ label, href }, index) => {
          const jumpIndex = index === 0 ? PRIVACY_JUMP_INDEX : TERMS_JUMP_INDEX;
          return (
            <JumpAnchor
              key={label}
              jumpIndex={jumpIndex}
              digit={footerDigit(jumpIndex)}
              href={href}
              flashedKey={flashedKey}
              className={linkClassName}
            >
              {label}
            </JumpAnchor>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3 border-border border-t pt-4">
      <div className="flex items-center gap-3">
        {SOCIAL_LINKS.map(({ id, label, href }, index) => {
          const SocialIcon = SOCIAL_ICONS[id];
          return (
            <JumpAnchor
              key={id}
              jumpIndex={index}
              digit={footerDigit(index)}
              href={href}
              label={label}
              flashedKey={flashedKey}
              className="c-focus-ring inline-flex shrink-0 items-center gap-1 text-text-muted transition-colors hover:text-text"
            >
              <SocialIcon size={18} weight="bold" />
            </JumpAnchor>
          );
        })}
      </div>
      <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 text-text-muted text-xs">
        <a href={ROOT_ROUTES.SHORTCUTS} className={linkClassName}>
          Shortcuts
        </a>
        <a href={PRACTICE_LINK.href} className={linkClassName}>
          {PRACTICE_LINK.label}
        </a>
        <JumpAnchor
          letter={PRICING_LINK.letter}
          digit={PRICING_LINK.shortcut}
          href={PRICING_LINK.href}
          flashedKey={flashedKey}
          className={linkClassName}
        >
          {PRICING_LINK.label}
        </JumpAnchor>
        {DIGIT_LEGAL_LINKS.map(({ label, href }, index) => (
          <JumpAnchor
            key={label}
            jumpIndex={SOCIAL_LINKS.length + index}
            digit={footerDigit(SOCIAL_LINKS.length + index)}
            href={href}
            flashedKey={flashedKey}
            className={linkClassName}
          >
            {label}
          </JumpAnchor>
        ))}
      </div>
    </div>
  );
}
