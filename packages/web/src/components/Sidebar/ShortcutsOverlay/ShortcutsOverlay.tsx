import { XIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { ZIndex } from "@web/common/constants/web.constants";
import { ShortcutSection } from "@web/components/Shortcuts/ShortcutOverlay/ShortcutSection";
import {
  selectIsShortcutsOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

interface Props {
  sections: ShortcutOverlaySection[];
  viewLabel?: string;
}

const normalizeSearch = (text: string): string => text.toLowerCase().trim();

const matchesSearch = (normalizedQuery: string, text: string): boolean =>
  normalizeSearch(text).includes(normalizedQuery);

export function ShortcutsOverlay({ sections, viewLabel }: Props) {
  const isOpen = useViewStore(selectIsShortcutsOpen);
  const [searchQuery, setSearchQuery] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // App-lock is held by useSidebarShortcuts; ignoreAppLock keeps Escape able
  // to clear search / dismiss while that lock is active. ignoreInputs: false
  // so Escape still works while the search field is focused.
  useAppShortcut(
    "Escape",
    () => {
      if (searchQuery) {
        setSearchQuery("");
      } else {
        viewActions.closeShortcuts();
      }
    },
    {
      enabled: isOpen,
      ignoreInputs: false,
      ignoreAppLock: true,
    },
  );

  // Prefer `inert` over permanently mounting an `aria-hidden` dialog: inert
  // removes the subtree from the a11y tree and blocks interaction while
  // keeping the slide animation. (Conditional unmount is the other F3
  // option, but it exposed unrelated sidebar contrast debt to axe that
  // the old covering dialog had been papering over — tracked separately.)
  // App-lock is held only while open, so a closed-but-mounted overlay does
  // not block form/toast Escape.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.inert = !isOpen;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      return;
    }

    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [isOpen]);

  const hasSections = sections.some((section) => section.shortcuts.length > 0);
  if (!hasSections) return null;

  const normalizedQuery = normalizeSearch(searchQuery);
  const visibleSections = sections
    .map((section) => {
      if (!normalizedQuery) return section;

      const shortcuts = section.shortcuts.filter(
        (shortcut) =>
          matchesSearch(normalizedQuery, shortcut.label) ||
          shortcut.keys.some((key) => matchesSearch(normalizedQuery, key)),
      );

      return { ...section, shortcuts };
    })
    .filter((section) => section.shortcuts.length > 0);

  const subtitle = viewLabel
    ? `Keyboard shortcuts for ${viewLabel} view`
    : "Keyboard shortcuts";

  return (
    <div
      ref={overlayRef}
      aria-label="Keyboard shortcuts"
      className={classNames(
        "absolute inset-0 overflow-hidden",
        !isOpen && "pointer-events-none",
      )}
      role="dialog"
      style={{ zIndex: ZIndex.MAX }}
    >
      <div
        className={classNames(
          "flex h-full flex-col bg-surface/95 px-4 pt-8 pb-5 text-text-muted shadow-2xl backdrop-blur-md",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex-1">
            <div className="font-medium text-text text-xl">Shortcuts</div>
            <div className="mt-1 text-text-muted text-xs">{subtitle}</div>
          </div>

          <button
            aria-label="Close shortcuts"
            className="flex size-7 items-center justify-center rounded-default text-text-muted transition-colors hover:bg-surface-panel hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={viewActions.closeShortcuts}
            type="button"
          >
            <XIcon aria-hidden="true" size={15} />
          </button>
        </div>

        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search shortcuts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4 rounded-default bg-surface-panel px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />

        {visibleSections.length > 0 ? (
          <div className="overflow-y-auto">
            {visibleSections.map((section, index) => (
              <ShortcutSection
                key={section.id}
                isFirst={index === 0}
                title={section.title}
                shortcuts={section.shortcuts}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-sm text-text-muted">
              No shortcuts found
            </div>
          </div>
        )}

        <a
          href={ROOT_ROUTES.SHORTCUTS}
          className="c-focus-ring mt-auto pt-4 text-text-muted text-xs underline-offset-4 hover:text-text hover:underline"
        >
          Printable version
        </a>
      </div>
    </div>
  );
}
