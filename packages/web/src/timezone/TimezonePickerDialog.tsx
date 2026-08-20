import {
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { getBrowserTimeZone } from "@web/timezone/browser-timezone";
import {
  setPinnedTimeZone,
  useEffectiveTimeZone,
  usePinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { TimezoneOptionButton } from "@web/timezone/TimezoneOptionButton";
import {
  setTimeTravelZone,
  useTimeTravelZone,
} from "@web/timezone/time-travel.store";
import {
  buildTimeZoneList,
  filterTimeZones,
  sortTimeZonesByOffsetDistance,
} from "@web/timezone/timezone-catalog";
import { type TimezoneDialogPurpose } from "@web/timezone/timezone-dialog.store";

const AUTO_ID = "auto";
const STOP_ID = "stop-time-travel";
const VISIBLE_PAGE = 40;

interface TimezonePickerDialogProps {
  onDismiss: () => void;
  purpose?: TimezoneDialogPurpose;
  restoreFocus?: () => void;
}

export function TimezonePickerDialog({
  onDismiss,
  purpose = "pin",
  restoreFocus,
}: TimezonePickerDialogProps) {
  const isTimeTravel = purpose === "time-travel";
  const effectiveTimeZone = useEffectiveTimeZone();
  const pinnedTimeZone = usePinnedTimeZone();
  const timeTravelZone = useTimeTravelZone();
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(
    isTimeTravel ? (timeTravelZone ?? "") : (pinnedTimeZone ?? AUTO_ID),
  );
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE);
  const now = useMemo(() => new Date(), []);
  const catalog = useMemo(
    () =>
      sortTimeZonesByOffsetDistance(buildTimeZoneList(now), effectiveTimeZone),
    [effectiveTimeZone, now],
  );
  const zones = useMemo(
    () => filterTimeZones(catalog, query),
    [catalog, query],
  );

  const browserZone = getBrowserTimeZone();
  const browserAbbreviation = formatTimeZoneAbbreviation(browserZone, now);
  const isAuto = pinnedTimeZone === null;
  const canStop =
    isTimeTravel && timeTravelZone !== null && query.trim() === "";
  const optionIds = [
    ...(canStop ? [STOP_ID] : []),
    ...(isTimeTravel ? [] : [AUTO_ID]),
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

  const commit = (timeZone: string | null) => {
    if (isTimeTravel) {
      setTimeTravelZone(timeZone);
    } else {
      setPinnedTimeZone(timeZone);
    }
    onDismiss();
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
      if (currentActiveId === AUTO_ID || currentActiveId === STOP_ID) {
        commit(null);
      } else if (currentActiveId !== "") {
        commit(currentActiveId);
      }
    }
  };

  const handleListScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 24) return;
    setVisibleCount((count) => Math.min(zones.length, count + VISIBLE_PAGE));
  };

  return (
    <OverlayPanel
      title={isTimeTravel ? "Time travel" : "Change default timezone"}
      onDismiss={onDismiss}
      restoreFocus={restoreFocus}
      initialFocusRef={searchRef}
      align="start"
      variant="modal"
      widthClassName="w-[480px]"
    >
      <div className="flex w-full flex-col gap-3">
        <input
          ref={searchRef}
          aria-activedescendant={`${listId}-${currentActiveId}`}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={true}
          aria-haspopup="listbox"
          aria-label="Search timezones"
          role="combobox"
          autoComplete="off"
          className="c-focus-ring w-full rounded border border-border bg-surface-overlay px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted"
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            const nextZones = filterTimeZones(catalog, nextQuery);
            if (isTimeTravel) {
              setActiveId(
                nextZones[0]?.id ??
                  (timeTravelZone !== null && nextQuery.trim() === ""
                    ? STOP_ID
                    : ""),
              );
            } else {
              setActiveId(AUTO_ID);
            }
            setVisibleCount(VISIBLE_PAGE);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search city, region, or abbreviation"
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
          {canStop ? (
            <TimezoneOptionButton
              active={currentActiveId === STOP_ID}
              description="Remove the extra hour column"
              id={`${listId}-${STOP_ID}`}
              label="Stop time travel"
              onSelect={() => commit(null)}
              selected={false}
            />
          ) : null}
          {isTimeTravel ? null : (
            <TimezoneOptionButton
              active={currentActiveId === AUTO_ID}
              description={`Currently ${browserAbbreviation}`}
              id={`${listId}-${AUTO_ID}`}
              label={`Use browser timezone (Auto)`}
              onSelect={() => commit(null)}
              selected={isAuto}
            />
          )}
          {visibleZones.map((zone) => (
            <TimezoneOptionButton
              active={currentActiveId === zone.id}
              description={zone.secondary}
              id={`${listId}-${zone.id}`}
              key={zone.id}
              label={zone.city}
              onSelect={() => commit(zone.id)}
              selected={
                isTimeTravel
                  ? zone.id === timeTravelZone
                  : !isAuto && zone.id === effectiveTimeZone
              }
            />
          ))}
        </div>
      </div>
    </OverlayPanel>
  );
}
