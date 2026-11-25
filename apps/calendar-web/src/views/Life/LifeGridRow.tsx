import { memo, type Ref } from "react";
import { getLifeDotLabel, WEEKS_PER_ROW } from "@core/life/life-math";
import {
  pageJumpAttrs,
  pageJumpChipAttrs,
} from "@web/shortcuts/page-jump/page-jump.targets";

const weeks = Array.from({ length: WEEKS_PER_ROW }, (_, index) => index);

interface Props {
  row: number;
  hasBirthDate: boolean;
  weeksLived: number;
  selected: number | null;
  tabStop: number;
  zoom: number;
  currentWeekLabel?: string;
  currentWeekRef?: Ref<HTMLButtonElement>;
}

export const LifeGridRow = memo(function LifeGridRow({
  row,
  hasBirthDate,
  weeksLived,
  selected,
  tabStop,
  zoom,
  currentWeekLabel,
  currentWeekRef,
}: Props) {
  const start = row * WEEKS_PER_ROW;
  const year = row + 1;
  const showYear = year === 1 || year % (zoom ? 5 : 10) === 0;
  const size = ["max-w-2", "max-w-4", "max-w-6"][zoom];
  const height = ["h-2.5", "h-6", "h-8"][zoom];
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2">
      <span
        aria-hidden="true"
        title={showYear ? `Year ${year}` : undefined}
        className={`sticky left-0 z-20 flex h-full items-center justify-end bg-background pr-2 text-text-muted tabular-nums leading-none after:absolute after:inset-y-0 after:left-full after:w-[calc(0.5rem+var(--life-edge,0px))] after:bg-background ${zoom ? "text-xs" : "text-[10px]"}`}
      >
        {showYear && year}
      </span>
      <div
        className={zoom ? "grid min-w-0" : "grid min-w-0 gap-px"}
        style={{
          gridTemplateColumns: `repeat(${WEEKS_PER_ROW}, minmax(0, 1fr))`,
        }}
      >
        {weeks.map((column) => {
          const index = start + column;
          const current = hasBirthDate && index === weeksLived;
          const color =
            current || index < weeksLived ? "bg-accent" : "bg-text/15";
          const dot = (
            <span
              aria-hidden="true"
              className={`block aspect-square w-full ${size} rounded-[2px] ${color} ${current ? "ring-1 ring-accent/60 motion-safe:animate-pulse" : ""} ${selected === index ? "outline-2 outline-text outline-offset-1" : ""}`}
            />
          );
          if (!hasBirthDate)
            return (
              <span
                key={index}
                className={`grid ${height} place-items-center`}
                title={getLifeDotLabel(index + 1)}
              >
                {dot}
              </span>
            );
          return (
            <button
              key={index}
              id={`life-week-${index}`}
              value={index}
              type="button"
              aria-label={
                current ? currentWeekLabel : getLifeDotLabel(index + 1)
              }
              aria-current={current ? "date" : undefined}
              tabIndex={index === tabStop ? 0 : -1}
              ref={current ? currentWeekRef : undefined}
              {...(current
                ? {
                    ...pageJumpAttrs("life-grid"),
                    ...pageJumpChipAttrs("life-grid"),
                  }
                : {})}
              className={`relative grid ${height} min-w-0 place-items-center rounded-sm focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-accent`}
            >
              {dot}
            </button>
          );
        })}
      </div>
    </div>
  );
});
