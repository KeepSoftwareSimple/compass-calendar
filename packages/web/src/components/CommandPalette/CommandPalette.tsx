import {
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { promptShortcutUpgrade } from "@web/billing/prompt-shortcut-upgrade";
import { useShortcutWriteLocked } from "@web/billing/useBillingWriteLock";
import { Z_INDEX_MODAL } from "@web/common/constants/web.constants";
import { eventCommandPaletteItems } from "@web/components/CommandPalette/event.cmd.constants";
import { HighlightedLabel } from "@web/components/CommandPalette/HighlightedLabel";
import { useAuthCmdItems } from "@web/components/CommandPalette/hooks/useAuthCmdItems";
import { useDemoEventsCmdItems } from "@web/components/CommandPalette/hooks/useDemoEventsCmdItems";
import { useLogoutCmdItems } from "@web/components/CommandPalette/hooks/useLogoutCmdItems";
import { useShowAccountsCmdItems } from "@web/components/CommandPalette/hooks/useShowAccountsCmdItems";
import { useShowBillingCmdItems } from "@web/components/CommandPalette/hooks/useShowBillingCmdItems";
import { useShowBookingCmdItems } from "@web/components/CommandPalette/hooks/useShowBookingCmdItems";
import { useThemeCmdItems } from "@web/components/CommandPalette/hooks/useThemeCmdItems";
import { useUpgradeCmdItems } from "@web/components/CommandPalette/hooks/useUpgradeCmdItems";
import { getMoreCommandPaletteSections } from "@web/components/CommandPalette/more.cmd.constants";
import {
  getNavigationCommandItems,
  getNavigationViewRoute,
} from "@web/components/CommandPalette/navigation.cmd.constants";
import {
  recordRecentCommand,
  useRecentCommandIds,
} from "@web/components/CommandPalette/recent-commands.store";
import { shortcutShowcaseActions } from "@web/components/ShortcutShowcase/showcase.store";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { type EventMutationDependencies } from "@web/events/mutations/useEventMutations";
import { useUndoRedo } from "@web/events/mutations/useUndoRedo";
import { useNotificationCmdItems } from "@web/notifications/useNotificationCmdItems";
import {
  selectIsCmdPaletteOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { pointerShortcutAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";
import { recordShortcutUnavailableAttempt } from "@web/shortcuts/tips/shortcut-telemetry";
import { useTimezoneCmdItems } from "@web/timezone/useTimezoneCmdItems";
import { filterSections, getLabelMatchRanges } from "./command-palette.search";
import { type CommandItem, type CommandSection } from "./command-palette.types";

const RECENT_SECTION_ID = "recent";
const MAX_RECENT_ITEMS = 3;

interface CommandPaletteProps {
  currentView: ViewName;
  onGoToToday: () => void;
  onShowShortcuts: () => void;
  onShowWelcomeGuide?: () => void;
  placeholder: string;
  mutationDependencies?: EventMutationDependencies;
}

interface CommandPaletteContentProps {
  placeholder: string;
  sections: CommandSection[];
}

/** Mounted only while open so search/activeIndex reset on every reopen. */
const CommandPaletteContent = ({
  placeholder,
  sections,
}: CommandPaletteContentProps) => {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  // Entrance-only fade/scale via `@starting-style` / `starting:` — no exit
  // animation. Close is driven by the external `isCmdPaletteOpen` store
  // (shortcuts + tests flip it synchronously), and this component unmounts
  // the instant it flips false; animating that would need a delayed-unmount
  // state machine to handle "reopened while still closing." Not worth it for
  // a UI pattern where an instant close is normal — dismissal isn't a
  // decision the user watches, unlike a confirmation modal.

  // Focus the search input the moment it mounts (commit phase, like the
  // autoFocus attribute — but without tripping the a11y lint). Stable identity
  // keeps it from re-firing on every keystroke re-render.
  const focusInputOnMount = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  const close = () => settingsActions.closeCmdPalette();

  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) close();
    },
  });

  const trimmedSearch = search.trim();
  // The Recent section only makes sense as a landing state — once the user
  // is typing, filterSections would keep a recent item alongside its normal
  // section entry (same id, same label) whenever it happens to match,
  // producing a visible duplicate row. Drop it before filtering instead.
  const sectionsToFilter = trimmedSearch
    ? sections.filter((section) => section.id !== RECENT_SECTION_ID)
    : sections;
  const filteredSections = filterSections(sectionsToFilter, search);
  const flatItems = filteredSections.flatMap((section) => section.items);
  const disabledIndices = flatItems.reduce<number[]>((acc, item, index) => {
    if (item.disabled) acc.push(index);
    return acc;
  }, []);
  const resultCount = flatItems.length;
  const liveRegionText = !trimmedSearch
    ? ""
    : resultCount === 0
      ? `No results for “${search}”`
      : `${resultCount} result${resultCount === 1 ? "" : "s"}`;

  // Invoke the item action directly — not via HTMLElement.click() — so
  // the capture-phase click blocker cannot swallow Enter.
  const activateItem = (item: CommandItem) => {
    if (item.disabled) return;
    recordRecentCommand(item.id);
    item.onClick?.();
    close();
  };

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    virtual: true,
    loop: true,
    disabledIndices,
  });
  const { getReferenceProps, getItemProps } = useInteractions([
    dismiss,
    role,
    listNav,
  ]);

  let itemIndex = -1;

  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className="flex justify-center bg-background/85 opacity-100 starting:opacity-0 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none"
        style={{ zIndex: Z_INDEX_MODAL }}
      >
        {/* No FloatingFocusManager: virtual list navigation keeps real focus in
            the search input, so a focus trap would only fight it. We focus the
            input on open via the focusInputOnMount callback ref above. */}
        <div
          ref={refs.setFloating}
          className="mt-[15vh] h-fit w-[640px] max-w-[90vw] scale-100 starting:scale-95 overflow-hidden rounded-xl border border-border bg-surface opacity-100 starting:opacity-0 shadow-[0_16px_48px_var(--color-shadow-default)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
        >
          <input
            {...getReferenceProps({
              onKeyDown(event) {
                if (event.key === "Enter" && activeIndex != null) {
                  event.preventDefault();
                  const item = flatItems[activeIndex];
                  if (item) activateItem(item);
                }
              },
            })}
            ref={focusInputOnMount}
            type="text"
            value={search}
            placeholder={placeholder}
            aria-label="Command palette search"
            className="w-full border-border border-b bg-transparent px-4 py-3 text-text outline-none placeholder:text-text-muted focus-visible:border-accent"
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
          />

          {/* Visually hidden — announces result count changes to screen
              reader users, who otherwise get no feedback that typing
              changed what's showing. Wording matches the visible
              zero-results message below rather than diverging from it. */}
          <span aria-live="polite" className="sr-only">
            {liveRegionText}
          </span>

          <div className="max-h-[50vh] overflow-y-auto p-2">
            {filteredSections.length === 0 ? (
              <div className="px-3 py-2 text-text">
                No results for “{search}”
              </div>
            ) : (
              filteredSections.map((section) => (
                <div key={section.id} className="mb-1">
                  <div className="px-3 pt-2 pb-1 font-semibold text-text text-xs uppercase tracking-wide">
                    {section.heading}
                  </div>
                  {section.items.map((item) => {
                    itemIndex += 1;
                    const index = itemIndex;
                    const isActive = activeIndex === index;
                    const rowClassName = `flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-text-muted ${
                      isActive
                        ? "bg-surface-overlay ring-1 ring-accent ring-inset"
                        : ""
                    } ${item.disabled ? "cursor-default opacity-50" : ""}`;

                    const content = (
                      <>
                        <item.icon size={18} />
                        <span className="min-w-0 flex-1 truncate">
                          {trimmedSearch ? (
                            <HighlightedLabel
                              label={item.label}
                              ranges={getLabelMatchRanges(item.label, search)}
                            />
                          ) : (
                            item.label
                          )}
                        </span>
                        {item.badge && (
                          <span className="ml-auto shrink-0 rounded border border-border px-1.5 text-text-muted text-xs">
                            {item.badge}
                          </span>
                        )}
                        {item.shortcut && (
                          <ShortcutKeys
                            className={`shrink-0 ${item.badge ? "" : "ml-auto"}`}
                            keys={item.shortcut}
                          />
                        )}
                      </>
                    );

                    return (
                      <button
                        key={item.id}
                        {...getItemProps({
                          ref(node: HTMLElement | null) {
                            listRef.current[index] = node;
                          },
                          onPointerMove() {
                            if (item.disabled || isActive) return;
                            setActiveIndex(index);
                          },
                          onClick() {
                            activateItem(item);
                          },
                        })}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        disabled={item.disabled}
                        className={rowClassName}
                        {...pointerShortcutAttributes("Enter")}
                      >
                        {content}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-end gap-4 border-border border-t px-4 py-1.5 text-text-muted text-xs">
            <span className="inline-flex items-center gap-1.5">
              <ShortcutKeys keys={["ArrowUp", "ArrowDown"]} />
              Navigate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShortcutKeys keys="Enter" />
              Select
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShortcutKeys keys="Esc" />
              Close
            </span>
          </div>
        </div>
      </FloatingOverlay>
    </FloatingPortal>
  );
};

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
  const navigate = useNavigate();
  const demoEventsCmdItems = useDemoEventsCmdItems();
  const authCmdItems = useAuthCmdItems();
  const showAccountsCmdItems = useShowAccountsCmdItems();
  const showBillingCmdItems = useShowBillingCmdItems();
  const showBookingCmdItems = useShowBookingCmdItems();
  const logoutCmdItems = useLogoutCmdItems();
  const themeCmdItems = useThemeCmdItems();
  const upgradeCmdItems = useUpgradeCmdItems();
  const timezoneCmdItems = useTimezoneCmdItems();
  const notificationCmdItems = useNotificationCmdItems();
  const { undo, redo, canUndo, canRedo } = useUndoRedo(mutationDependencies);
  const recentCommandIds = useRecentCommandIds();

  const sections: CommandSection[] = [
    {
      id: "navigation",
      heading: "Navigation",
      items: getNavigationCommandItems({
        currentView,
        onGoToToday,
        onNavigateToView: (viewName) =>
          navigate({ to: getNavigationViewRoute(viewName) }),
        onShowShortcuts,
        onPracticeShortcuts: () => shortcutShowcaseActions.replay(),
        onShowWelcomeGuide,
      }),
    },
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
    {
      id: "appearance",
      heading: "Appearance",
      items: themeCmdItems,
    },
    {
      id: "settings",
      heading: "Settings",
      items: [
        ...upgradeCmdItems,
        ...timezoneCmdItems,
        ...notificationCmdItems,
        ...authCmdItems,
        ...showAccountsCmdItems,
        ...showBillingCmdItems,
        ...showBookingCmdItems,
        ...logoutCmdItems,
      ],
    },
    ...getMoreCommandPaletteSections(currentView),
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
      placeholder={placeholder}
      sections={sectionsWithRecent}
    />
  );
};

export const LifeCommandPalette = ({
  placeholder,
}: {
  placeholder: string;
}) => {
  const open = useSettingsStore(selectIsCmdPaletteOpen);
  useAppLockReason("commandPalette", open);
  const navigate = useNavigate();
  const themeCmdItems = useThemeCmdItems();
  const timezoneCmdItems = useTimezoneCmdItems();
  const notificationCmdItems = useNotificationCmdItems();

  if (!open) return null;

  return (
    <CommandPaletteContent
      placeholder={placeholder}
      sections={[
        {
          id: "navigation",
          heading: "Navigation",
          items: getNavigationCommandItems({
            currentView: "life",
            onNavigateToView: (viewName) =>
              navigate({ to: getNavigationViewRoute(viewName) }),
          }),
        },
        {
          id: "appearance",
          heading: "Appearance",
          items: themeCmdItems,
        },
        {
          id: "settings",
          heading: "Settings",
          items: [...timezoneCmdItems, ...notificationCmdItems],
        },
        ...getMoreCommandPaletteSections("life"),
      ]}
    />
  );
};
