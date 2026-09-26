import { type RefObject } from "react";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  type SettingsPage,
  settingsActions,
} from "@web/settings/settings.store";
import { settingsShortcutAttrs } from "@web/settings/useSettingsShortcuts";

const navButtonClassName = (current: boolean) =>
  current
    ? "c-focus-ring flex w-full items-center justify-between rounded border-l-2 border-accent bg-surface-overlay px-2 py-1 text-left text-sm font-medium text-text"
    : "c-focus-ring flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-text";

interface SettingsNavButtonProps {
  /** Screen-reader sentence behind the warning dot, or null for no dot. */
  attention?: string | null;
  /** The page Settings is showing, so the current entry can mark itself. */
  currentPage: SettingsPage;
  /** Seated on whichever entry is current, so the panel opens focused. */
  initialFocusRef: RefObject<HTMLButtonElement | null>;
  label: string;
  page: SettingsPage;
  /** The digit that jumps here, shown while Mod is held. */
  shortcutDigit: string;
  showShortcut: boolean;
}

/**
 * One entry in the Settings sidebar. The shortcut id follows the page name
 * (`nav-booking`), which is what useSettingsShortcuts clicks on a digit.
 */
export function SettingsNavButton({
  attention = null,
  currentPage,
  initialFocusRef,
  label,
  page,
  shortcutDigit,
  showShortcut,
}: SettingsNavButtonProps) {
  const isCurrent = currentPage === page;

  return (
    <button
      aria-current={isCurrent ? "true" : undefined}
      className={navButtonClassName(isCurrent)}
      onClick={() => settingsActions.setSettingsPage(page)}
      onPointerEnter={focusOnPointerEnter}
      ref={isCurrent ? initialFocusRef : undefined}
      type="button"
      {...settingsShortcutAttrs(`nav-${page}`)}
    >
      {attention == null ? (
        label
      ) : (
        <span className="flex items-center gap-2">
          {label}
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-warning"
          />
          <span className="sr-only">{attention}</span>
        </span>
      )}
      {showShortcut ? <ShortcutKeys keys={shortcutDigit} /> : null}
    </button>
  );
}
