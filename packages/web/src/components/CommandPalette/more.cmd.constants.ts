import { CalendarCheckIcon } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { ChatsIcon } from "@phosphor-icons/react/dist/csr/Chats";
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { isPosthogEnabled } from "@web/auth/posthog/posthog.util";
import {
  type CommandItem,
  type CommandSection,
} from "@web/components/CommandPalette/command-palette.types";
import { withPaletteShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import { feedbackActions } from "@web/components/Feedback/feedback.store";
import { settingsActions } from "@web/settings/settings.store";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";

export const PERSONAL_ONBOARDING_URL =
  "https://calendly.com/switchback-tech/compass-onboarding";

export function getSettingsCommandItem(): CommandItem {
  return {
    id: "open-settings",
    label: "Settings",
    icon: GearIcon,
    shortcut: [...APP_SHORTCUT_BINDINGS.otherSettings.keycaps],
    keywords: ["preferences", "account", "options"],
    onClick: withPaletteShortcut("other-settings", () =>
      settingsActions.openSettings("accounts", { fromPalette: true }),
    ),
  };
}

export const COMMAND_PALETTE_PLACEHOLDER =
  "Search commands, events, or type a date";

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
