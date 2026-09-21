import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
} from "@phosphor-icons/react";
import { promptShortcutUpgrade } from "@web/billing/prompt-shortcut-upgrade";
import { useShortcutWriteLocked } from "@web/billing/useBillingWriteLock";
import { CommandPaletteContent } from "@web/components/CommandPalette/CommandPaletteContent";
import { eventCommandPaletteItems } from "@web/components/CommandPalette/event.cmd.constants";
import { useAuthCmdItems } from "@web/components/CommandPalette/hooks/useAuthCmdItems";
import { useDemoEventsCmdItems } from "@web/components/CommandPalette/hooks/useDemoEventsCmdItems";
import { useLogoutCmdItems } from "@web/components/CommandPalette/hooks/useLogoutCmdItems";
import { useShowAccountsCmdItems } from "@web/components/CommandPalette/hooks/useShowAccountsCmdItems";
import { useShowBillingCmdItems } from "@web/components/CommandPalette/hooks/useShowBillingCmdItems";
import { useShowBookingCmdItems } from "@web/components/CommandPalette/hooks/useShowBookingCmdItems";
import { useUpgradeCmdItems } from "@web/components/CommandPalette/hooks/useUpgradeCmdItems";
import {
  RECENT_SECTION_ID,
  useRecentCommandIds,
} from "@web/components/CommandPalette/recent-commands.store";
import { usePaletteSections } from "@web/components/CommandPalette/usePaletteSections";
import { shortcutShowcaseActions } from "@web/components/ShortcutShowcase/showcase.store";
import { type EventMutationDependencies } from "@web/events/mutations/useEventMutations";
import { useUndoRedo } from "@web/events/mutations/useUndoRedo";
import {
  selectIsCmdPaletteOpen,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";
import { recordShortcutUnavailableAttempt } from "@web/shortcuts/tips/shortcut-telemetry";
import { type CommandItem, type CommandSection } from "./command-palette.types";

const MAX_RECENT_ITEMS = 3;

interface CommandPaletteProps {
  currentView: ViewName;
  onGoToToday: () => void;
  onShowShortcuts: () => void;
  onShowWelcomeGuide?: () => void;
  placeholder: string;
  mutationDependencies?: EventMutationDependencies;
}

export const CommandPalette = ({
  currentView,
  onGoToToday,
  onShowShortcuts,
  onShowWelcomeGuide,
  placeholder,
  mutationDependencies,
}: CommandPaletteProps) => {
  const open = useSettingsStore(selectIsCmdPaletteOpen);
  useAppLockReason("commandPalette", open);
  const writeLocked = useShortcutWriteLocked();
  const eventItems = writeLocked
    ? eventCommandPaletteItems.map((item) => ({
        ...item,
        badge: "Premium",
        onClick: () => {
          if (item.id === "create-event") {
            recordShortcutUnavailableAttempt("create-event", "billing_locked", {
              invocationMethod: "click",
            });
          }
          promptShortcutUpgrade({
            featureArea: "event_creation",
            actionId: "calendar.create_timed_event",
            source: "command_palette",
          });
        },
      }))
    : eventCommandPaletteItems;
  const demoEventsCmdItems = useDemoEventsCmdItems();
  const authCmdItems = useAuthCmdItems();
  const showAccountsCmdItems = useShowAccountsCmdItems();
  const showBillingCmdItems = useShowBillingCmdItems();
  const showBookingCmdItems = useShowBookingCmdItems();
  const logoutCmdItems = useLogoutCmdItems();
  const upgradeCmdItems = useUpgradeCmdItems();
  const shared = usePaletteSections(currentView, {
    onGoToToday,
    onShowShortcuts,
    onPracticeShortcuts: () => shortcutShowcaseActions.replay(),
    onShowWelcomeGuide,
  });
  const { undo, redo, canUndo, canRedo } = useUndoRedo(mutationDependencies);
  const recentCommandIds = useRecentCommandIds();

  const sections: CommandSection[] = [
    shared.navigation,
    {
      id: "general",
      heading: "Common Actions",
      items: [
        ...eventItems,
        ...demoEventsCmdItems,
        {
          id: "undo-last-change",
          label: "Undo last change",
          icon: ArrowCounterClockwiseIcon,
          shortcut: ["Mod", "Z"],
          keywords: ["revert", "back", "history"],
          disabled: !canUndo,
          // Defer so the palette unmounts before undo's refocusEventElement
          // starts hunting for the restored event element.
          onClick: () => queueMicrotask(undo),
        },
        {
          id: "redo-last-change",
          label: "Redo last change",
          icon: ArrowClockwiseIcon,
          shortcut: ["Mod", "Shift", "Z"],
          keywords: ["forward", "history", "repeat"],
          disabled: !canRedo,
          onClick: () => queueMicrotask(redo),
        },
      ],
    },
    shared.appearance,
    {
      id: "settings",
      heading: "Settings",
      items: [
        ...upgradeCmdItems,
        ...shared.settingsItems,
        ...authCmdItems,
        ...showAccountsCmdItems,
        ...showBillingCmdItems,
        ...showBookingCmdItems,
        ...logoutCmdItems,
      ],
    },
    ...shared.more,
  ];

  // Resolved against the already-built items so a stale id (hidden by auth
  // state, or an item that no longer exists) is skipped silently rather than
  // rendering a broken row. Recent items still also appear in their normal
  // section — this is a convenience shortcut, not a move.
  const itemsById = new Map<string, CommandItem>(
    sections.flatMap((section) => section.items.map((item) => [item.id, item])),
  );
  const recentItems = recentCommandIds
    .map((id) => itemsById.get(id))
    .filter((item): item is CommandItem => item !== undefined)
    .slice(0, MAX_RECENT_ITEMS);
  const sectionsWithRecent: CommandSection[] =
    recentItems.length > 0
      ? [
          { id: RECENT_SECTION_ID, heading: "Recent", items: recentItems },
          ...sections,
        ]
      : sections;

  if (!open) return null;

  return (
    <CommandPaletteContent
      currentView={currentView}
      placeholder={placeholder}
      sections={sectionsWithRecent}
    />
  );
};
