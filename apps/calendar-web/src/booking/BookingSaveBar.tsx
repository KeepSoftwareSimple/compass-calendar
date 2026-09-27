import {
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { settingsShortcutAttrs } from "@web/settings/useSettingsShortcuts";

export const BOOKING_SAVE_CHANGES_LABEL = "Save changes";

export const BOOKING_SETTINGS_SAVE_BAR_CLASS_NAME =
  "sticky -bottom-8 z-10 border-border border-t bg-surface-panel pt-3 pb-8";

interface BookingSaveBarProps {
  error: string | null;
  isPending: boolean;
  onSubmit: () => void;
}

export function BookingSaveBar({
  error,
  isPending,
  onSubmit,
}: BookingSaveBarProps) {
  const pendingLabel = isPending ? "Saving…" : BOOKING_SAVE_CHANGES_LABEL;

  return (
    <div
      className={`${BOOKING_SETTINGS_SAVE_BAR_CLASS_NAME} flex flex-wrap items-center justify-end gap-3`}
    >
      {/* Default align=end keeps the always-on chip Save off the hours column. */}
      <OverlayPanelActions>
        <OverlayPanelActionButton
          aria-busy={isPending || undefined}
          aria-keyshortcuts="Meta+Enter Control+Enter"
          className="whitespace-nowrap"
          disabled={isPending}
          onClick={onSubmit}
          shortcut={["Mod", "Enter"]}
          showShortcut
          variant="primary"
          {...settingsShortcutAttrs("save-booking")}
        >
          {pendingLabel}
        </OverlayPanelActionButton>
      </OverlayPanelActions>
      {error ? (
        <p
          className="min-w-0 basis-full font-medium text-sm text-text"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
