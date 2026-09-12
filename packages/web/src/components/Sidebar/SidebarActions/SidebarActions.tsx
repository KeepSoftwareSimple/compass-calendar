import { CommandIcon, GearIcon, KeyboardIcon } from "@phosphor-icons/react";
import { useGoogleUiState } from "@web/auth/providers/useProviderUiState";
import { SidebarRefreshButton } from "@web/components/Sidebar/SidebarRefreshButton";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import {
  selectIsShortcutsOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import {
  selectIsCmdPaletteOpen,
  selectIsSettingsOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";

export const SidebarActions = () => {
  const isShortcutsOpen = useViewStore(selectIsShortcutsOpen);
  const isCmdPaletteOpen = useSettingsStore(selectIsCmdPaletteOpen);
  const isSettingsOpen = useSettingsStore(selectIsSettingsOpen);
  const googleState = useGoogleUiState();
  const isCalendarSyncing = googleState === "IMPORTING";

  const toggleCmdPalette = () => {
    if (isCmdPaletteOpen) {
      settingsActions.closeCmdPalette();
    } else {
      settingsActions.openCmdPalette();
    }
  };

  const shortcutsActionLabel = isShortcutsOpen
    ? "Close shortcuts"
    : "Open shortcuts";

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-border border-t px-3">
      <div className="flex items-center gap-2">
        <TooltipWrapper
          description={shortcutsActionLabel}
          shortcut="?"
          onClick={viewActions.toggleShortcuts}
        >
          <button
            aria-label={shortcutsActionLabel}
            className="flex size-9 items-center justify-center rounded-default text-text-muted transition hover:bg-surface-panel hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            type="button"
          >
            <KeyboardIcon
              aria-hidden="true"
              size={16}
              weight={isShortcutsOpen ? "fill" : "regular"}
            />
          </button>
        </TooltipWrapper>
        <SidebarRefreshButton />
      </div>

      <div className="flex items-center gap-2">
        <TooltipWrapper
          description="Open settings"
          shortcut={["Mod", ","]}
          onClick={() => settingsActions.openSettings()}
        >
          <button
            aria-label="Open settings"
            className="flex size-9 items-center justify-center rounded-default text-text-muted transition hover:bg-surface-panel hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            type="button"
          >
            <GearIcon
              aria-hidden="true"
              size={16}
              weight={isSettingsOpen ? "fill" : "regular"}
            />
          </button>
        </TooltipWrapper>
        <TooltipWrapper
          description="Open command palette"
          shortcut={["Mod", "K"]}
          onClick={toggleCmdPalette}
        >
          <button
            aria-label={
              isCalendarSyncing
                ? "Open command palette, syncing in the background"
                : "Open command palette"
            }
            className="flex size-9 items-center justify-center rounded-default text-text-muted transition hover:bg-surface-panel hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            type="button"
          >
            <span className="relative flex size-4 items-center justify-center">
              <CommandIcon
                aria-hidden="true"
                size={16}
                weight={isCmdPaletteOpen ? "fill" : "regular"}
              />
              {isCalendarSyncing ? (
                <CommandIcon
                  aria-hidden="true"
                  className="c-sync-icon-wave absolute inset-0 text-text"
                  size={16}
                  weight={isCmdPaletteOpen ? "fill" : "regular"}
                />
              ) : null}
            </span>
          </button>
        </TooltipWrapper>
      </div>
    </div>
  );
};
