import {
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
  type Ref,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { TimezoneOptionButton } from "@web/timezone/TimezoneOptionButton";
import {
  buildTimeZoneList,
  filterTimeZones,
  sortTimeZonesByOffsetDistance,
  type TimeZoneListItem,
  timeZoneCityName,
} from "@web/timezone/timezone-catalog";

const VISIBLE_PAGE = 40;

/**
 * A synthetic row above the catalog, e.g. "Use browser timezone (Auto)" or
 * "Stop time travel". Kept as a prop so pinning and time travel stay in the
 * dialog and this component knows nothing about either.
 */
export interface TimezoneComboboxHeadOption {
  id: string;
  label: string;
  description: string;
  selected: boolean;
  /** What onSelect receives when this row is chosen. */
  value: string | null;
  /** Drop the row once the user types, e.g. "Stop time travel". */
  hideOnQuery?: boolean;
}

interface TimezoneComboboxProps {
  value: string | null;
  onSelect: (timeZone: string | null) => void;
  headOptions?: readonly TimezoneComboboxHeadOption[];
  searchLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Zone the catalog is sorted around; defaults to `value`. */
  sortAround?: string;
  /** Zone to leave out of the catalog, e.g. the one already on screen. */
  excludeZone?: string;
}

/**
 * The searchable timezone list: a `role="combobox"` input driving a
 * `role="listbox"` through `aria-activedescendant`, so real focus never leaves
 * the input and Tab is free to move past the whole control.
 *
 * Only VISIBLE_PAGE rows are mounted at a time - the IANA catalog is ~420
 * entries and paying for all of them on first paint is visible.
 */
export function TimezoneCombobox({
  value,
  onSelect,
  headOptions = [],
  searchLabel,
  inputRef,
  sortAround,
  excludeZone,
}: TimezoneComboboxProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE);
  const now = useMemo(() => new Date(), []);
  const anchorZone = sortAround ?? value ?? "";

  const catalog = useMemo(() => {
    const list = sortTimeZonesByOffsetDistance(
      buildTimeZoneList(now),
      anchorZone,
    ).filter((zone) => zone.id !== excludeZone || zone.id === value);
    // Intl.supportedValuesOf only reports canonical ids, so a stored alias
    // ("US/Pacific") has no row and the field would look empty. Synthesize one
    // rather than silently showing nothing.
    if (value && !list.some((zone) => zone.id === value)) {
      const abbreviation = formatTimeZoneAbbreviation(value, now);
      const alias: TimeZoneListItem = {
        id: value,
        city: timeZoneCityName(value),
        region: value,
        abbreviation,
        offset: "",
        offsetMinutes: 0,
        secondary: abbreviation,
        keywords: [value],
      };
      return [alias, ...list];
    }
    return list;
  }, [anchorZone, excludeZone, now, value]);

  const zones = useMemo(
    () => filterTimeZones(catalog, query),
    [catalog, query],
  );

  const [activeId, setActiveId] = useState(value ?? headOptions[0]?.id ?? "");

  const hasQuery = query.trim() !== "";
  const shownHeadOptions = hasQuery
    ? headOptions.filter((option) => !option.hideOnQuery)
    : headOptions;
  const optionIds = [
    ...shownHeadOptions.map((option) => option.id),
    ...zones.map((zone) => zone.id),
  ];
  const visibleZones = zones.slice(0, visibleCount);
  const fallbackId = optionIds[0] ?? "";
  const currentActiveId = optionIds.includes(activeId) ? activeId : fallbackId;

  useEffect(() => {
    document
      .getElementById(`${listId}-${currentActiveId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [currentActiveId, listId]);

  const commit = (id: string) => {
    const head = headOptions.find((option) => option.id === id);
    if (head) {
      onSelect(head.value);
      return;
    }
    if (id !== "") onSelect(id);
  };

  const moveActive = (delta: number) => {
    const currentIndex = optionIds.indexOf(currentActiveId);
    const nextIndex = Math.min(
      optionIds.length - 1,
      Math.max(0, (currentIndex === -1 ? 0 : currentIndex) + delta),
    );
    setActiveId(optionIds[nextIndex] ?? fallbackId);
    setVisibleCount((count) => (nextIndex > count ? nextIndex : count));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(currentActiveId);
    }
  };

  const handleListScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 24) return;
    setVisibleCount((count) => Math.min(zones.length, count + VISIBLE_PAGE));
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <input
        ref={inputRef}
        aria-activedescendant={`${listId}-${currentActiveId}`}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={true}
        aria-haspopup="listbox"
        aria-label={searchLabel}
        autoComplete="off"
        className="c-focus-ring w-full rounded border border-border bg-surface-overlay px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted"
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          const nextZones = filterTimeZones(catalog, nextQuery);
          // Typing seats the top result; clearing seats a head row that
          // survives a query (Auto), else the top result (time travel's Stop
          // row is gone by then).
          const nextActive =
            nextQuery.trim().length > 0
              ? (nextZones[0]?.id ??
                headOptions.find((option) => !option.hideOnQuery)?.id ??
                "")
              : (headOptions.find((option) => !option.hideOnQuery)?.id ??
                nextZones[0]?.id ??
                headOptions[0]?.id ??
                "");
          setActiveId(nextActive);
          setVisibleCount(VISIBLE_PAGE);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search city, region, or abbreviation"
        role="combobox"
        type="search"
        value={query}
      />
      <div
        aria-label="Timezones"
        className="max-h-80 overflow-y-auto"
        id={listId}
        onScroll={handleListScroll}
        role="listbox"
      >
        {shownHeadOptions.map((option) => (
          <TimezoneOptionButton
            active={currentActiveId === option.id}
            description={option.description}
            id={`${listId}-${option.id}`}
            key={option.id}
            label={option.label}
            onSelect={() => onSelect(option.value)}
            selected={option.selected}
          />
        ))}
        {visibleZones.map((zone) => (
          <TimezoneOptionButton
            active={currentActiveId === zone.id}
            description={zone.secondary}
            id={`${listId}-${zone.id}`}
            key={zone.id}
            label={zone.city}
            onSelect={() => onSelect(zone.id)}
            selected={zone.id === value}
          />
        ))}
      </div>
    </div>
  );
}
