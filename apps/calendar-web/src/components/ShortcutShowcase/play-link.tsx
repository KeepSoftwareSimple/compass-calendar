import { useNavigate, useSearch } from "@tanstack/react-router";
import { type FC, useEffect } from "react";
import { shortcutShowcaseActions } from "@web/components/ShortcutShowcase/showcase.store";
import { markWelcomeSeen } from "@web/components/WelcomeModal/welcome.modal.util";

/**
 * Synchronous read of the ?play= deep link, for the two spots that decide
 * before the router-driven consumer below can run: the welcome modal's
 * open-on-mount initializer and the showcase's resume-in-progress effect.
 */
export const hasPlayDeepLink = (): boolean =>
  new URLSearchParams(window.location.search).has("play");

/**
 * Consumes a shared ?play=1 link: an explicit request to play Block Party,
 * so it skips the welcome modal (the end screen still carries the signup
 * CTA) and starts even for players who finished the game before. Consume
 * and strip, so a reload does not restart the run. Lives apart from
 * ShortcutShowcase because it needs the router, which the takeover's tests
 * render without; sessions where RootShell gates the mount (mobile,
 * billing) simply ignore the param.
 */
export const ShowcasePlayLink: FC = () => {
  const { play } = useSearch({ from: "__root__" });
  const navigate = useNavigate();

  useEffect(() => {
    if (!play) return;
    markWelcomeSeen();
    shortcutShowcaseActions.startFromLink();
    navigate({
      to: ".",
      replace: true,
      search: (prev) => ({ ...prev, play: undefined }),
    });
  }, [play, navigate]);

  return null;
};
