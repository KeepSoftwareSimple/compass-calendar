import classNames from "classnames";
import { useContext, useEffect, useId, useRef, useState } from "react";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { useStartGoogleAuthorization } from "@web/auth/google/authorization/useStartGoogleAuthorization";
import { track } from "@web/auth/posthog/track";
import {
  CALENDAR_HOST_EXPLAINER,
  CONNECT_THE_CALENDAR_YOU_USE,
} from "@web/auth/providers/provider-copy.util";
import { useIsProviderAvailable } from "@web/auth/providers/useIsProviderAvailable";
import { MODAL_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { GoogleButton } from "@web/components/AuthModal/components/GoogleButton";
import { MicrosoftButton } from "@web/components/AuthModal/components/MicrosoftButton";
import { useAuthModal } from "@web/components/AuthModal/hooks/useAuthModal";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { hasPlayDeepLink } from "@web/components/ShortcutShowcase/play-link";
import { shortcutShowcaseActions } from "@web/components/ShortcutShowcase/showcase.store";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { keyboardKey } from "@web/shortcuts/is-bare-letter-key";
import { pointerPassAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
import { PixelPirate } from "./PixelPirate";
import { useFaqDisclosure } from "./useFaqDisclosure";
import { useWelcomeJumpShortcuts } from "./useWelcomeJumpShortcuts";
import { WelcomeFaqList } from "./WelcomeFaqList";
import { WelcomeLinks } from "./WelcomeLinks";
import { welcomeGuideActions } from "./welcome.guide.store";
import { hasSeenWelcome, markWelcomeSeen } from "./welcome.modal.util";

/** Commit (1) → learn (2) → choose how to start (3). */
type WelcomeStep = 1 | 2 | 3;
const WELCOME_STEPS: readonly WelcomeStep[] = [1, 2, 3];

const PRIMARY_CTA_CLASS =
  "c-button c-button-primary c-button-elevated inline-flex h-10 w-full items-center justify-center rounded-full";
const TEXT_CTA_CLASS =
  "c-focus-ring inline-flex items-center rounded-md px-2 py-1 text-text-muted text-xs hover:bg-surface-overlay hover:text-text";

function WelcomeSteps({ step }: { step: WelcomeStep }) {
  return (
    <div className="flex w-full items-center justify-center gap-2">
      <span className="sr-only">
        Step {step} of {WELCOME_STEPS.length}
      </span>
      {WELCOME_STEPS.map((dot) => (
        <span
          key={dot}
          aria-hidden
          className={classNames(
            "h-1.5 w-1.5 rounded-full transition-colors",
            dot === step ? "bg-text" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

export function WelcomeModal() {
  const { authenticated } = useContext(SessionContext);
  const { openModal, isOpen: isAuthModalOpen } = useAuthModal();
  const isGoogleAvailable = useIsProviderAvailable("google", "signIn");
  const isMicrosoftConnectAvailable = useIsProviderAvailable(
    "microsoft",
    "connect",
  );
  const { loading: isGoogleAuthLoading, startGoogleAuthorization } =
    useStartGoogleAuthorization({ intent: "signIn" });
  // A ?play= deep link goes straight to the practice game. This initializer
  // runs before ShowcasePlayLink's consume effect can mark welcome seen, so
  // the param itself has to keep this modal closed.
  const [isOpen, setIsOpen] = useState(
    () => !authenticated && !hasSeenWelcome() && !hasPlayDeepLink(),
  );
  const [step, setStep] = useState<WelcomeStep>(1);
  const { closing, beginDismiss, cancelDismiss } =
    useDismissTransition(MODAL_DISMISS_MS);
  // Suppress OverlayPanel's unmount restore when handing off to Auth — Auth
  // seats its own focus; restoring the underlay first causes a focus flash.
  const skipFocusRestoreRef = useRef(false);
  // Explore starts the practice after this dialog unmounts. A login/signup
  // handoff during the fade must cancel that so the takeover does not cover
  // the auth form.
  const startShowcaseAfterDismissRef = useRef(false);
  // openModal() only schedules a URL update. Hide immediately so Explore
  // cannot start the practice on top of a login that has not committed yet.
  const [hidingForAuth, setHidingForAuth] = useState(false);
  const hidingForAuthRef = useRef(false);
  const googleHandoffRef = useRef(false);
  // Each screen has one primary button, and Enter is its native activation.
  // On the last screen that is email signup rather than Google: Enter on an
  // OAuth redirect would fling a first-time visitor off-site.
  const primaryRef = useRef<HTMLButtonElement>(null);
  const faqHintId = `${useId()}-faq-hint`;
  const faq = useFaqDisclosure();
  // Digits 1-5 only toggle FAQ on the screen that shows it; 6-0 no-op until
  // the footer links mount on the last screen.
  useWelcomeJumpShortcuts(step === 2 ? faq.toggleAt : undefined);

  // The auth modal's openness lives in the URL (?auth=), so the welcome
  // screen simply hides while it is open and reappears when the browser
  // back button (or Escape) removes the param again.
  const visible =
    isOpen && !isAuthModalOpen && !authenticated && !hidingForAuth;

  useEffect(() => {
    if (isAuthModalOpen) return;
    hidingForAuthRef.current = false;
    setHidingForAuth(false);
  }, [isAuthModalOpen]);

  useEffect(() => {
    if (isGoogleAuthLoading) return;
    googleHandoffRef.current = false;
  }, [isGoogleAuthLoading]);

  const shownRef = useRef(false);
  useEffect(() => {
    if (visible) {
      skipFocusRestoreRef.current = false;
      if (!shownRef.current) {
        shownRef.current = true;
        track("welcome_modal_shown");
      }
    }
  }, [visible]);

  // Each screen seats its own primary button (OverlayPanel only seats focus
  // once, on mount) so Enter keeps meaning "the obvious next thing", and
  // counts as viewed once no matter how often Back revisits it.
  const viewedStepsRef = useRef(new Set<WelcomeStep>());
  useEffect(() => {
    if (!visible) return;
    primaryRef.current?.focus();
    if (viewedStepsRef.current.has(step)) return;
    viewedStepsRef.current.add(step);
    track("welcome_step_viewed", { step });
  }, [step, visible]);

  useEffect(() => {
    welcomeGuideActions.setFirstVisitOpen(visible);
    return () => welcomeGuideActions.setFirstVisitOpen(false);
  }, [visible]);

  if (!visible) return null;

  // Auth handoffs win over everything else. The explore fade (`closing`) is
  // not one of them: a login during that fade must still cancel the pending
  // practice start, so only the step and explore actions check it.
  const isHandingOff = () =>
    hidingForAuthRef.current || googleHandoffRef.current || isGoogleAuthLoading;

  const advance = () => {
    if (closing || isHandingOff()) return;
    setStep((current) => (current < 3 ? ((current + 1) as WelcomeStep) : 3));
  };

  // Escape, backdrop and the Back button all step back one screen. On the
  // first screen they do nothing: a stray Escape must not drop a first-time
  // visitor into the practice game before they chose anything.
  const goBack = () => {
    if (closing || isHandingOff()) return;
    setStep((current) => (current > 1 ? ((current - 1) as WelcomeStep) : 1));
  };

  // Fade the backdrop and gently scale the panel before unmounting, so the
  // first reveal of the sidebar underneath feels smooth rather than abrupt.
  const explore = () => {
    if (closing || isHandingOff()) return;
    skipFocusRestoreRef.current = true;
    markWelcomeSeen();
    track("welcome_modal_dismissed", { cta: "explore" });
    startShowcaseAfterDismissRef.current = true;
    // Start after this dialog unmounts so the practice takeover does not
    // share a focus trap with the fading welcome overlay.
    beginDismiss(() => {
      if (!startShowcaseAfterDismissRef.current) return;
      startShowcaseAfterDismissRef.current = false;
      setIsOpen(false);
      shortcutShowcaseActions.startFromWelcome();
    });
  };

  const beginAuthHandoff = () => {
    skipFocusRestoreRef.current = true;
    startShowcaseAfterDismissRef.current = false;
    hidingForAuthRef.current = true;
    setHidingForAuth(true);
    cancelDismiss();
  };

  const handOffToAuth = (cta: "log_in" | "sign_up") => {
    beginAuthHandoff();
    markWelcomeSeen();
    if (cta === "sign_up") {
      shortcutShowcaseActions.deferUntilSignup();
      track("signup_started", { source: "welcome_modal" });
    }
    track("welcome_modal_dismissed", { cta });
    openModal(cta === "log_in" ? "login" : "signUp");
  };

  // The shortest path to the thing that makes Compass worth keeping: one
  // round trip that signs the user up and grants calendar access together,
  // because the Google scopes Compass asks for include the calendar.
  const handOffToGoogle = () => {
    // Stay mounted: Google is a redirect, and a GIS error must not hide
    // welcome for the rest of the session. Ignore Explore while it loads.
    skipFocusRestoreRef.current = true;
    startShowcaseAfterDismissRef.current = false;
    googleHandoffRef.current = true;
    cancelDismiss();
    markWelcomeSeen();
    shortcutShowcaseActions.deferUntilSignup();
    track("welcome_modal_dismissed", { cta: "sign_up_google" });
    track("signup_started", { source: "welcome_modal_google" });
    void startGoogleAuthorization();
  };

  const handleShortcutKey = (e: React.KeyboardEvent) => {
    // A held Enter auto-repeats native button clicks, which would blast
    // through all three screens and into signup. Only the first press counts.
    if (e.key === "Enter" && e.repeat) {
      e.preventDefault();
      return;
    }
    if (isHandingOff()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = keyboardKey(e).toLowerCase();
    if (key === "i") {
      e.preventDefault();
      handOffToAuth("log_in");
      return;
    }
    if (step !== 3) return;
    if (key === "g" && isGoogleAvailable) {
      e.preventDefault();
      handOffToGoogle();
    } else if (key === "m" && isMicrosoftConnectAvailable) {
      e.preventDefault();
      handOffToAuth("sign_up");
    } else if (key === "u") {
      e.preventDefault();
      handOffToAuth("sign_up");
    } else if (key === "s") {
      e.preventDefault();
      explore();
    }
  };

  const backButton = (
    <button type="button" onClick={goBack} className={TEXT_CTA_CLASS}>
      Back
      <ShortcutHint className="ml-2">Esc</ShortcutHint>
    </button>
  );

  return (
    <OverlayPanel
      align="start"
      ariaLabel="Welcome to Compass Calendar"
      backdropClassName="overflow-y-auto py-8"
      closing={closing}
      initialFocusRef={primaryRef}
      onDismiss={goBack}
      skipFocusRestoreRef={skipFocusRestoreRef}
      widthClassName="w-120"
    >
      {/* The welcome overlay is the one calendar surface where the mouse
          works: a landing page should behave like a normal site. Keyboard-only
          starts once the visitor enters the calendar. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: keydown here is a modal-scoped shortcut layer, not an interactive element in its own right */}
      <div
        className="flex w-full flex-col gap-6"
        onKeyDown={handleShortcutKey}
        {...pointerPassAttributes}
      >
        {/* Top row: pirate top-left, Log in top-right, on every screen so a
            returning user is never walked through the pitch. */}
        <div className="flex items-center justify-between">
          <div className="group relative flex items-center">
            <PixelPirate className="h-14 w-14 shrink-0" />
            <div className="pointer-events-none absolute left-full ml-1 flex -translate-x-1 items-center opacity-0 transition-all duration-200 ease-out group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100">
              <span
                aria-hidden
                className="h-0 w-0 border-y-4 border-y-transparent border-r-4 border-r-surface-overlay"
              />
              <span className="whitespace-nowrap rounded-lg bg-surface-overlay px-3 py-1 font-[VT323,monospace] text-base text-text">
                No signup required
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => handOffToAuth("log_in")}
              className="c-button-compact c-button-secondary rounded-3xl px-4 py-1.5 text-xs"
            >
              Log in
              <ShortcutHint className="ml-2">i</ShortcutHint>
            </button>
          </div>
        </div>

        {step === 1 && (
          <>
            <div className="flex w-full flex-col gap-2">
              <h1 className="font-bold text-2xl text-text leading-snug">
                The Keyboard Calendar
              </h1>
              <p className="text-text-muted">
                Rediscover the joy of shortcuts as you build your perfect
                schedule. No clicks allowed.
              </p>
              <p className="text-sm text-text-muted">
                Compass is a faster, simpler, open-source calendar for busy
                professionals who live at their keyboard.
              </p>
            </div>
            <div className="flex w-full flex-col items-center gap-3">
              <button
                type="button"
                ref={primaryRef}
                onClick={advance}
                className={PRIMARY_CTA_CLASS}
              >
                Get started for free
                <ShortcutHint className="ml-2">Enter</ShortcutHint>
              </button>
              <p className="text-center text-text-muted text-xs">
                No account needed.
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex w-full flex-col gap-2">
              <h2 className="font-bold text-2xl text-text leading-snug">
                How Compass works
              </h2>
              <p id={faqHintId} className="text-text-muted">
                Press a number to open a question.
              </p>
            </div>
            <WelcomeFaqList
              describedById={faqHintId}
              expanded={faq.expanded}
              flashedKey={null}
              onToggle={faq.toggle}
            />
            <div className="flex w-full flex-col items-center gap-3">
              <button
                type="button"
                ref={primaryRef}
                onClick={advance}
                className={PRIMARY_CTA_CLASS}
              >
                Next
                <ShortcutHint className="ml-2">Enter</ShortcutHint>
              </button>
              {backButton}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="flex w-full flex-col gap-2">
              <h2 className="font-bold text-2xl text-text leading-snug">
                {CONNECT_THE_CALENDAR_YOU_USE}
              </h2>
              <p className="text-text-muted">
                Pick how you want to start. You can sign up later.
              </p>
              <p className="text-text-muted text-xs">
                {CALENDAR_HOST_EXPLAINER}
              </p>
            </div>
            {/* Connecting a calendar is the moment Compass starts being
                useful, so the Google round trip, which signs up and grants
                calendar access at once, leads; everything else is a fallback
                from it. */}
            <div className="flex w-full flex-col items-center gap-3">
              {isGoogleAvailable && (
                <>
                  <GoogleButton
                    onClick={handOffToGoogle}
                    disabled={isGoogleAuthLoading}
                    label="Continue with Google"
                    shortcutKey="G"
                    style={{ width: "100%" }}
                  />
                  <p className="text-center text-text-muted text-xs">
                    Signs you up and connects your Google Calendar.
                  </p>
                </>
              )}
              {isMicrosoftConnectAvailable && (
                <>
                  <MicrosoftButton
                    onClick={() => handOffToAuth("sign_up")}
                    disabled={isGoogleAuthLoading}
                    label="Connect Microsoft"
                    shortcutKey="M"
                    style={{ width: "100%" }}
                  />
                  <p className="text-center text-text-muted text-xs">
                    Create an account, then connect Microsoft from Settings.
                  </p>
                </>
              )}
              <button
                type="button"
                ref={primaryRef}
                onClick={() => handOffToAuth("sign_up")}
                className={PRIMARY_CTA_CLASS}
              >
                {isGoogleAvailable ? "Sign up with email" : "Sign up"}
                <ShortcutHint className="ml-2">U</ShortcutHint>
              </button>
              <button
                type="button"
                onClick={explore}
                className={TEXT_CTA_CLASS}
              >
                Explore without an account
                <ShortcutHint className="ml-2">S</ShortcutHint>
              </button>
              {backButton}
            </div>
          </>
        )}

        <WelcomeSteps step={step} />

        {step === 3 && <WelcomeLinks flashedKey={null} />}
      </div>
    </OverlayPanel>
  );
}
