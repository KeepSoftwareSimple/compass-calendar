import { X } from "@phosphor-icons/react";
import { type FC, type ReactNode, useEffect, useState } from "react";
import {
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { track } from "@web/auth/posthog/track";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import IconButton from "@web/components/IconButton/IconButton";
import {
  selectShowcaseActive,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  selectWelcomeSurfaceOpen,
  useWelcomeGuideStore,
} from "@web/components/WelcomeModal/welcome.guide.store";
import {
  type BlockedPointerAttempt,
  POINTER_ACTIONS,
  pointerPassAttributes,
} from "@web/shortcuts/keyboard-only/pointer-action";
import { writePointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  selectPointerHintAttempt,
  selectPointerHintPulse,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  CONNECTION_BANNER_SHORTCUT_KEY,
  START_TRIAL_SHORTCUT_KEY,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import {
  selectEventJumpPointerHintKey,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";

const HINT_VISIBLE_MS = 2500;

const Key = ({ children }: { children: string }) => (
  <kbd className="c-keycap">{children}</kbd>
);

const pointerHintMessage = ({
  attempt,
  eventJumpKey,
  showcaseActive,
  welcomeOpen,
}: {
  attempt: BlockedPointerAttempt | null;
  eventJumpKey: string | null;
  showcaseActive: boolean;
  welcomeOpen: boolean;
}): ReactNode => {
  if (showcaseActive) return "Follow the keys on screen.";

  // The click already did its job through a working control; only the key
  // for next time is new information.
  if (attempt?.performed) {
    if (attempt.actionId === POINTER_ACTIONS.switchView) {
      return (
        <>
          Next time, press <Key>W</Key>, <Key>D</Key>, or <Key>L</Key> to switch
          views.
        </>
      );
    }
    if (attempt.shortcutKey) {
      return (
        <>
          Next time, press <ShortcutKeys keys={attempt.shortcutKey} />.
        </>
      );
    }
  }

  if (
    attempt?.actionId === POINTER_ACTIONS.sidebarClose ||
    attempt?.actionId === POINTER_ACTIONS.sidebarOpen
  ) {
    const verb =
      attempt.actionId === POINTER_ACTIONS.sidebarClose ? "close" : "open";
    return (
      <>
        Press <Key>]</Key> to {verb} the sidebar.
      </>
    );
  }

  if (attempt?.actionId === POINTER_ACTIONS.goToToday) {
    return (
      <>
        Press <Key>T</Key> to go to today.
      </>
    );
  }

  if (attempt?.actionId === POINTER_ACTIONS.datePick) {
    return (
      <>
        Press <Key>I</Key> to focus the calendar, then use the arrow keys and{" "}
        <Key>Enter</Key> to go to a date.
      </>
    );
  }

  if (attempt?.actionId === POINTER_ACTIONS.switchView) {
    return (
      <>
        Press <Key>W</Key>, <Key>D</Key>, or <Key>L</Key> to switch views.
      </>
    );
  }

  if (attempt?.actionId === POINTER_ACTIONS.eventOpen) {
    if (!eventJumpKey) {
      return (
        <>
          Press <ShortcutKeys keys={[...KEYMAP.eventJump.keycaps]} /> to reveal
          event shortcuts.
        </>
      );
    }
    return (
      <>
        Press <Key>{eventJumpKey}</Key>, then <Key>Enter</Key> to open this
        event.
      </>
    );
  }

  if (attempt?.actionId === "grid.timed" && attempt.gridTimeKey) {
    return (
      <>
        Type <Key>{attempt.gridTimeKey}</Key> to create an event at{" "}
        {attempt.gridTimeLabel ?? attempt.gridTimeKey}.
      </>
    );
  }

  if (attempt?.actionId === "grid.all-day") {
    return (
      <>
        Press <Key>Shift+C</Key> to create an all-day event here.
      </>
    );
  }

  if (attempt?.actionId === POINTER_ACTIONS.startTrial) {
    return (
      <>
        Press <Key>{START_TRIAL_SHORTCUT_KEY}</Key> to start your trial.
      </>
    );
  }

  if (attempt?.actionId === POINTER_ACTIONS.reconnectGoogle) {
    const provider: ProviderKind = attempt.provider ?? "google";
    return (
      <>
        Press <Key>{CONNECTION_BANNER_SHORTCUT_KEY}</Key> to reconnect{" "}
        {providerDisplayName(provider)} Calendar.
      </>
    );
  }

  if (attempt?.actionId === POINTER_ACTIONS.upNextDismiss) {
    return (
      <>
        Press <Key>Esc</Key> to dismiss.
      </>
    );
  }

  if (attempt?.shortcutKey) {
    return (
      <>
        Press <ShortcutKeys keys={attempt.shortcutKey} />
      </>
    );
  }

  if (welcomeOpen) return "Use the keys on this screen.";

  return (
    <>
      Compass works from the keyboard. Press <Key>?</Key> to see every shortcut.
    </>
  );
};

/**
 * Teaches the keyboard path on every click instead of silently ignoring it.
 * The tracker pulses the store; this pill names the exact keys for the
 * clicked target. Mounted in RootShell so it shows with the sidebar closed
 * too. Top-center to stay clear of the Up Next banner's bottom-center spot.
 */
export const PointerHint: FC = () => {
  const pulse = usePointerHintStore(selectPointerHintPulse);
  const attempt = usePointerHintStore(selectPointerHintAttempt);
  const eventJumpKey = useEventJumpStore(selectEventJumpPointerHintKey);
  const showcaseActive = useShortcutShowcaseStore(selectShowcaseActive);
  const welcomeOpen = useWelcomeGuideStore(selectWelcomeSurfaceOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (pulse === 0) return;
    setIsVisible(true);
    const timer = window.setTimeout(() => setIsVisible(false), HINT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  if (!isVisible) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 left-1/2 flex max-w-[min(100vw-2rem,36rem)] -translate-x-1/2 starting:translate-y-1 items-start gap-2 rounded-lg border border-border bg-surface-panel/90 px-3 py-1.5 text-sm text-text starting:opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 ease-out motion-reduce:transition-none"
      data-pointer-hint=""
      role="status"
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <span className="min-w-0 flex-1">
        {pointerHintMessage({
          attempt,
          eventJumpKey,
          showcaseActive,
          welcomeOpen,
        })}
      </span>
      <IconButton
        {...pointerPassAttributes}
        aria-label="Turn off keyboard tips"
        className="shrink-0 opacity-70 hover:opacity-100"
        onClick={() => {
          writePointerHintDismissedPermanently();
          track("pointer_hint_dismissed");
          setIsVisible(false);
        }}
        size="small"
        type="button"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
};
