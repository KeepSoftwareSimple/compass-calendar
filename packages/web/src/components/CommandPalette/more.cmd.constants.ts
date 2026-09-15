import { CalendarCheckIcon } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { ChatsIcon } from "@phosphor-icons/react/dist/csr/Chats";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { isPosthogEnabled } from "@web/auth/posthog/posthog.util";
import { type CommandSection } from "@web/components/CommandPalette/command-palette.types";
import { feedbackActions } from "@web/components/Feedback/feedback.store";
import { settingsActions } from "@web/settings/settings.store";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";
import { type CommandPaletteViewName } from "./navigation.cmd.constants";

export const PERSONAL_ONBOARDING_URL =
  "https://calendly.com/switchback-tech/compass-onboarding";

export function getCommandPalettePlaceholder(
  currentView: CommandPaletteViewName,
  feedbackEnabled = isPosthogEnabled(),
): string {
  if (currentView === "life") {
    return feedbackEnabled
      ? "Try: 'day', 'week', or 'feedback'"
      : "Try: 'day', 'week', or 'theme'";
  }

  if (currentView === "day") {
    return feedbackEnabled
      ? "Try: 'play', 'week', or 'feedback'"
      : "Try: 'play' or 'week'";
  }

  return feedbackEnabled
    ? "Try: 'play', 'create', or 'feedback'"
    : "Try: 'play' or 'create'";
}

export function getMoreCommandPaletteSections(
  currentView: ViewName,
  feedbackEnabled = isPosthogEnabled(),
): CommandSection[] {
  const feedbackItems = feedbackEnabled
    ? [
        {
          id: "share-feedback",
          label: "Share Feedback",
          icon: ChatsIcon,
          keywords: ["bug", "report", "issue", "problem", "suggest", "contact"],
          onClick: () => {
            settingsActions.markOverlayOpenedFromPalette();
            feedbackActions.open(currentView);
          },
        },
      ]
    : [];

  return [
    {
      heading: "More",
      id: "advanced",
      items: [
        ...feedbackItems,
        {
          id: "book-personal-onboarding",
          label: "Book personal onboarding",
          icon: CalendarCheckIcon,
          keywords: [
            "calendly",
            "onboarding",
            "book",
            "meeting",
            "call",
            "demo",
            "setup",
          ],
          onClick: () =>
            window.open(
              PERSONAL_ONBOARDING_URL,
              "_blank",
              "noopener,noreferrer",
            ),
        },
        {
          id: "about",
          label: "About Compass",
          icon: InfoIcon,
          keywords: [
            "version",
            "info",
            "social",
            "twitter",
            "x",
            "linkedin",
            "github",
            "links",
          ],
          onClick: () => settingsActions.openAbout({ fromPalette: true }),
        },
      ],
    },
  ];
}
