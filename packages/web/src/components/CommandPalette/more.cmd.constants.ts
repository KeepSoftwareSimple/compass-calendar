import {
  CalendarCheckIcon,
  ChatsIcon,
  GearIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { isPosthogEnabled } from "@web/auth/posthog/posthog.util";
import {
  type CommandItem,
  type CommandSection,
} from "@web/components/CommandPalette/command-palette.types";
import { reportPaletteShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import { feedbackActions } from "@web/components/Feedback/feedback.store";
import { settingsActions } from "@web/settings/settings.store";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";
import { type CommandPaletteViewName } from "./navigation.cmd.constants";

export const PERSONAL_ONBOARDING_URL =
  "https://calendly.com/switchback-tech/compass-onboarding";

export function getSettingsCommandItem(): CommandItem {
  return {
    id: "open-settings",
    label: "Settings",
    icon: GearIcon,
    shortcut: [...APP_SHORTCUT_BINDINGS.otherSettings.keycaps],
    keywords: ["preferences", "account", "options"],
    onClick: () => {
      reportPaletteShortcut("other-settings", "other");
      settingsActions.openSettings("accounts", { fromPalette: true });
    },
  };
}

export function getCommandPalettePlaceholder(
  _currentView?: CommandPaletteViewName,
  _feedbackEnabled = isPosthogEnabled(),
): string {
  return "Search commands, events, or type a date";
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
        getSettingsCommandItem(),
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
