import type React from "react";
import { useEffect, useRef, useState } from "react";
import { track } from "@web/auth/posthog/track";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import {
  MOBILE_PRIMARY_BUTTON_CLASS,
  MOBILE_TEXT_BUTTON_CLASS,
} from "@web/components/MobileGate/mobile-buttons";

const WAITLIST_URL = "https://tylerdane.kit.com/compass-mobile";

/**
 * The desktop pitch and CTAs a mobile visitor ends on: copy the link for a
 * computer, or join the mobile waitlist. Shown after the game (with the
 * score as `header`) and on the intro's skip path.
 */
export const DesktopHandoff: React.FC<{ header?: React.ReactNode }> = ({
  header,
}) => {
  const [copied, setCopied] = useState(false);
  const copiedResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedResetTimeoutRef.current !== null) {
        window.clearTimeout(copiedResetTimeoutRef.current);
      }
    };
  }, []);

  const handleJoinWaitlist = () => {
    track("mobile_gate_waitlist_clicked");
    window.open(WAITLIST_URL, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    track("mobile_gate_link_copied");
    const url = window.location.href;
    if (!(await copyText(url))) {
      // Fallback for older mobile browsers without clipboard permission.
      window.prompt("Copy this link and open it on a computer:", url);
      return;
    }
    setCopied(true);
    if (copiedResetTimeoutRef.current !== null) {
      window.clearTimeout(copiedResetTimeoutRef.current);
    }
    copiedResetTimeoutRef.current = window.setTimeout(() => {
      copiedResetTimeoutRef.current = null;
      setCopied(false);
    }, 2000);
  };

  return (
    <div className="flex w-[400px] max-w-[90vw] flex-col items-center rounded border border-border bg-surface p-8 text-center">
      {header}
      <h1 className="mb-6 font-medium font-sans text-2xl text-text">
        Open Compass on a computer
      </h1>
      <p className="mb-8 font-sans text-base text-text-muted leading-relaxed">
        Compass isn&apos;t built for phones yet. Copy this link and open it on a
        laptop or desktop to try the full experience.
      </p>
      <button
        type="button"
        onClick={() => void handleCopyLink()}
        className={`mb-3 ${MOBILE_PRIMARY_BUTTON_CLASS}`}
      >
        {copied ? "Link copied" : "Copy link for desktop"}
      </button>
      <button
        type="button"
        onClick={handleJoinWaitlist}
        className={MOBILE_TEXT_BUTTON_CLASS}
      >
        Join mobile waitlist
      </button>
    </div>
  );
};
