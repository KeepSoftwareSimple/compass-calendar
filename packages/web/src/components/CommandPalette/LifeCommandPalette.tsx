import { CommandPaletteContent } from "@web/components/CommandPalette/CommandPaletteContent";
import { usePaletteSections } from "@web/components/CommandPalette/usePaletteSections";
import {
  selectIsCmdPaletteOpen,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useAppLockReason } from "@web/shortcuts/app-lock";

/**
 * Life view's palette. It deliberately skips the calendar palette's event,
 * billing, and account rows (and the hooks behind them): nothing on this view
 * can create or edit an event.
 */
export const LifeCommandPalette = ({
  placeholder,
}: {
  placeholder: string;
}) => {
  const open = useSettingsStore(selectIsCmdPaletteOpen);
  useAppLockReason("commandPalette", open);
  const { navigation, appearance, settingsItems, more } =
    usePaletteSections("life");

  if (!open) return null;

  return (
    <CommandPaletteContent
      currentView="life"
      placeholder={placeholder}
      sections={[
        navigation,
        appearance,
        { id: "settings", heading: "Settings", items: settingsItems },
        ...more,
      ]}
    />
  );
};
