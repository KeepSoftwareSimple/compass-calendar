import {
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatDateInputValue,
  getLifeDotLabel,
  parseLifeDate,
  WEEKS_PER_ROW,
} from "@core/life/life-math";
import { moveLifeUiFocusRight } from "@web/shortcuts/ui-focus/ui-focus-region.util";
import { LifeGridRow } from "@web/views/Life/LifeGridRow";
import { LifeWeekEvents } from "@web/views/Life/LifeWeekEvents";

interface LifeGridProps {
  birthDate: string;
  totalDots: number;
  weeksLived: number;
  summary: string;
  currentWeekLabel?: string;
  currentWeekRef?: Ref<HTMLButtonElement>;
  initialWeek?: number;
  initialZoom?: number;
  onOpenWeek: (date: string, index: number, zoom: number) => void;
}

const weekDates = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const directions: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -WEEKS_PER_ROW,
  ArrowDown: WEEKS_PER_ROW,
};
const control =
  "c-button c-button-secondary rounded-md px-3 py-1 text-sm disabled:opacity-40";
function weekButton(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLButtonElement>("button[value]")
    : null;
}
function dotAt(index: number) {
  return document.getElementById(`life-week-${index}`);
}

export function LifeGrid({
  birthDate,
  totalDots,
  weeksLived,
  summary,
  currentWeekLabel,
  currentWeekRef,
  initialWeek,
  initialZoom,
  onOpenWeek,
}: LifeGridProps) {
  const birth = useMemo(() => parseLifeDate(birthDate), [birthDate]);
  const viewport = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(initialZoom ?? 0);
  const columnWidth = zoom === 2 ? 28 : zoom === 1 ? 20 : 0;
  const alignColumnEdge = useCallback(() => {
    const area = viewport.current;
    if (!area) return;
    // A horizontal pan can stop mid-week. Keep that partial cell behind the gutter.
    const offset = columnWidth ? area.scrollLeft % columnWidth : 0;
    area.style.setProperty(
      "--life-edge",
      `${offset > 0 ? columnWidth - offset : 0}px`,
    );
  }, [columnWidth]);
  useLayoutEffect(alignColumnEdge, [alignColumnEdge]);
  const [selected, setSelected] = useState<number | null>(initialWeek ?? null);
  const [pinned, setPinned] = useState(initialWeek !== undefined);
  const active =
    birth && selected !== null && selected < totalDots ? selected : null;
  const tabStop = active ?? Math.min(weeksLived, totalDots - 1);
  const start = birth && active !== null ? new Date(birth) : null;
  start?.setDate(start.getDate() + (active ?? 0) * 7);
  const end = start && new Date(start);
  end?.setDate(end.getDate() + 6);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const lastWheelZoom = useRef(-Infinity);
  const restoreWeek = useRef(initialWeek);
  useLayoutEffect(() => {
    if (restoreWeek.current === undefined) return;
    const dot = dotAt(restoreWeek.current);
    dot?.scrollIntoView({ block: "center", inline: "center" });
    dot?.focus({ preventScroll: true });
    restoreWeek.current = undefined;
  }, []);
  const anchor = useRef<{ element: Element; x: number; y: number } | null>(
    null,
  );
  const changeZoom = useCallback(
    (step: number, pointer?: Element | null) => {
      const next = Math.min(2, Math.max(0, zoom + step));
      const area = viewport.current;
      if (!area || next === zoom) return;
      const bounds = area.getBoundingClientRect();
      const center = document.elementFromPoint?.(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      const chosen = active !== null ? dotAt(active) : null;
      const rect = chosen?.getBoundingClientRect();
      const visible =
        rect &&
        rect.bottom > bounds.top &&
        rect.top < bounds.bottom &&
        rect.right > bounds.left &&
        rect.left < bounds.right;
      const target = pointer ?? (visible ? chosen : null) ?? center;
      if (target && area.contains(target)) {
        const box = target.getBoundingClientRect();
        anchor.current = {
          element: target,
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
        };
      }
      setZoom(next);
    },
    [zoom, active],
  );
  useLayoutEffect(() => {
    const saved = anchor.current;
    if (!saved || !viewport.current) return;
    const rect = saved.element.getBoundingClientRect();
    viewport.current.scrollLeft += rect.left + rect.width / 2 - saved.x;
    viewport.current.scrollTop += rect.top + rect.height / 2 - saved.y;
    anchor.current = null;
  });
  useEffect(() => {
    const area = viewport.current;
    if (!area) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      if (event.timeStamp - lastWheelZoom.current < 120) return;
      lastWheelZoom.current = event.timeStamp;
      changeZoom(event.deltaY < 0 ? 1 : -1, weekButton(event.target));
    };
    area.addEventListener("wheel", wheel, { passive: false });
    return () => area.removeEventListener("wheel", wheel);
  }, [changeZoom]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-end gap-2 py-2 pr-5">
        {!birth && (
          <button
            type="button"
            className="mr-auto text-sm underline"
            onClick={moveLifeUiFocusRight}
          >
            Set birth date to explore weeks
          </button>
        )}
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom === 0}
          className={control}
          onClick={() => changeZoom(-1)}
        >
          −
        </button>
        <span className="w-12 text-center text-text-muted text-xs tabular-nums">
          {[100, 200, 300][zoom]}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom === 2}
          className={control}
          onClick={() => changeZoom(1)}
        >
          +
        </button>
      </div>
      <section
        aria-label={`Life visualization: ${summary}`}
        ref={viewport}
        className="min-h-0 flex-1 scroll-ps-16 overflow-auto pr-5 pb-6"
        onScroll={alignColumnEdge}
        onPointerOver={(event) => {
          if ((pinned && active !== null) || event.pointerType === "touch")
            return;
          const button = weekButton(event.target);
          if (
            !button ||
            button.contains(
              event.relatedTarget instanceof Node ? event.relatedTarget : null,
            )
          )
            return;
          clearTimeout(timer.current);
          const index = Number(button.value);
          timer.current = setTimeout(() => setSelected(index), 120);
        }}
        onPointerLeave={() => clearTimeout(timer.current)}
        onFocus={(event) => {
          const button = weekButton(event.target);
          if (button) {
            clearTimeout(timer.current);
            setSelected(Number(button.value));
          }
        }}
        onClick={(event) => {
          const button = weekButton(event.target);
          if (!button) return;
          clearTimeout(timer.current);
          setSelected(Number(button.value));
          setPinned(true);
        }}
        onKeyDown={(event) => {
          const button = weekButton(event.target);
          const step = directions[event.key];
          if (!button || step === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          dotAt(
            Math.max(0, Math.min(totalDots - 1, Number(button.value) + step)),
          )?.focus();
        }}
      >
        <div
          data-total-dots={totalDots}
          style={{
            minWidth: columnWidth
              ? `calc(3rem + ${WEEKS_PER_ROW * columnWidth}px)`
              : undefined,
          }}
        >
          {Array.from({ length: totalDots / WEEKS_PER_ROW }, (_, row) => (
            <LifeGridRow
              // biome-ignore lint/suspicious/noArrayIndexKey: A row is identified by its fixed position in the lifespan.
              key={row}
              row={row}
              hasBirthDate={birth !== null}
              weeksLived={weeksLived}
              selected={
                active !== null && Math.floor(active / WEEKS_PER_ROW) === row
                  ? active
                  : null
              }
              tabStop={
                Math.floor(tabStop / WEEKS_PER_ROW) === row ? tabStop : -1
              }
              zoom={zoom}
              currentWeekLabel={currentWeekLabel}
              currentWeekRef={currentWeekRef}
            />
          ))}
        </div>
      </section>
      {birth && (
        <section
          aria-label="Week preview"
          className="mx-2 flex h-28 shrink-0 flex-wrap content-start items-start justify-between gap-x-3 border-border border-t py-2 text-sm"
        >
          {start && end && active !== null ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-text-muted text-xs">
                  {getLifeDotLabel(active + 1)}
                </p>
                <h2 aria-live="polite" className="font-semibold">
                  {weekDates.formatRange(start, end)}
                </h2>
                <div className="text-text-muted text-xs">
                  <LifeWeekEvents date={formatDateInputValue(start)} />
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  className={control}
                  onClick={() =>
                    onOpenWeek(formatDateInputValue(start), active, zoom)
                  }
                >
                  Open week
                </button>
                {pinned && (
                  <button
                    type="button"
                    className="text-text-muted text-xs underline"
                    onClick={() => setPinned(false)}
                  >
                    Unpin preview
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-text-muted">
              Select a week to see its dates and calendar events.
            </p>
          )}
        </section>
      )}
    </>
  );
}
