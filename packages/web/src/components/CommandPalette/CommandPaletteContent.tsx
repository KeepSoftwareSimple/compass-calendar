import {
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import {
  EVENT_TITLE_SEARCH_PALETTE_LIMIT,
  eventTitle,
} from "@core/event/search-events-by-title";
import dayjs from "@core/util/date/dayjs";
import { Z_INDEX_MODAL } from "@web/common/constants/web.constants";
import { goToDateAnnouncement } from "@web/common/utils/datetime/web.date.util";
import { HighlightedLabel } from "@web/components/CommandPalette/HighlightedLabel";
import {
  GO_TO_DATE_ITEM_ID,
  getGoToDateCommandItem,
} from "@web/components/CommandPalette/navigation.cmd.constants";
import { pulsePaletteTaughtShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import {
  RECENT_SECTION_ID,
  recordRecentCommand,
} from "@web/components/CommandPalette/recent-commands.store";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { useEventSearch } from "@web/events/queries/useEventSearch";
import { settingsActions } from "@web/settings/settings.store";
import { pointerShortcutAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";
import { filterSections, getLabelMatchRanges } from "./command-palette.search";
import { type CommandItem, type CommandSection } from "./command-palette.types";
import {
  eventSearchDateString,
  eventSearchDetail,
  paletteEventRoute,
  startFocusEventCard,
} from "./event-search.util";

interface CommandPaletteContentProps {
  currentView: ViewName;
  placeholder: string;
  sections: CommandSection[];
}

/** Mounted only while open so search/activeIndex reset on every reopen. */
export const CommandPaletteContent = ({
  currentView,
  placeholder,
  sections,
}: CommandPaletteContentProps) => {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  // Entrance-only fade/scale via `@starting-style`. Close unmounts immediately
  // from the store; an exit animation would need delayed-unmount.

  // Focus the search input the moment it mounts (commit phase, like the
  // autoFocus attribute — but without tripping the a11y lint). Stable identity
  // keeps it from re-firing on every keystroke re-render.
  const focusInputOnMount = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  const close = () => settingsActions.closeCmdPalette();
  const navigate = useNavigate();
  const eventSearch = useEventSearch(search);
  const navigateToDate = (dateString: string, after?: () => void) => {
    void Promise.resolve(
      navigate({
        to: paletteEventRoute(currentView),
        params: { dateString },
      }),
    ).then(after);
  };

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
  const commandSections = filterSections(sectionsToFilter, search);
  const eventItems: CommandItem[] = (eventSearch.data ?? [])
    .slice(0, EVENT_TITLE_SEARCH_PALETTE_LIMIT)
    .map((event) => ({
      id: `event-search:${event.id}`,
      label: eventTitle(event) || "Untitled",
      detail: eventSearchDetail(event),
      icon: CalendarBlankIcon,
      onClick: () => {
        const eventId = event.id;
        navigateToDate(eventSearchDateString(event), () => {
          startFocusEventCard(eventId);
        });
      },
    }));
  const eventSection: CommandSection[] =
    eventItems.length > 0
      ? [{ id: "events", heading: "Events", items: eventItems }]
      : [];
  const goToDateItem = getGoToDateCommandItem(search, dayjs(), (date) => {
    const dateString = date.format(YEAR_MONTH_DAY_FORMAT);
    navigateToDate(dateString, () => {
      eventJumpActions.setActiveDayKeys(
        [dateString],
        goToDateAnnouncement(date, currentView),
      );
    });
  });
  const goToDateSection: CommandSection[] = goToDateItem
    ? [{ id: "go-to-date", heading: "", items: [goToDateItem] }]
    : [];
  const filteredSections = [
    ...goToDateSection,
    ...commandSections,
    ...eventSection,
  ];
  const flatItems = filteredSections.flatMap((section) => section.items);
  const disabledIndices = flatItems.reduce<number[]>((acc, item, index) => {
    if (item.disabled) acc.push(index);
    return acc;
  }, []);
  const resultCount = flatItems.length;
  const noResultsText = `No results for “${search}”`;
  const liveRegionText = !trimmedSearch
    ? ""
    : resultCount === 0
      ? noResultsText
      : `${resultCount} result${resultCount === 1 ? "" : "s"}`;

  // Invoke the item action directly — not via HTMLElement.click() — so
  // the capture-phase click blocker cannot swallow Enter.
  const activateItem = (item: CommandItem) => {
    if (item.disabled) return;
    recordRecentCommand(item.id);
    const shortcut = item.shortcut;
    item.onClick?.();
    close();
    pulsePaletteTaughtShortcut(shortcut);
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
          <span aria-live="polite" className="sr-only" role="status">
            {liveRegionText}
          </span>

          <div className="max-h-[50vh] overflow-y-auto p-2">
            {filteredSections.length === 0 ? (
              <div className="px-3 py-2 text-text">{noResultsText}</div>
            ) : (
              filteredSections.map((section) => (
                <div key={section.id} className="mb-1">
                  {section.heading ? (
                    <div className="px-3 pt-2 pb-1 font-semibold text-text text-xs uppercase tracking-wide">
                      {section.heading}
                    </div>
                  ) : null}
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
                          {trimmedSearch &&
                          !item.detail &&
                          item.id !== GO_TO_DATE_ITEM_ID ? (
                            <HighlightedLabel
                              label={item.label}
                              ranges={getLabelMatchRanges(item.label, search)}
                            />
                          ) : (
                            item.label
                          )}
                        </span>
                        {item.detail && (
                          <span className="shrink-0 text-text-muted text-xs">
                            {item.detail}
                          </span>
                        )}
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
                        tabIndex={-1}
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
