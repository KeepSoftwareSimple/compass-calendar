import { type Ref } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";
import { getLifeDotLabel, WEEKS_PER_ROW } from "./life.utils";

interface LifeGridProps {
  showCurrentWeek: boolean;
  totalDots: number;
  weeksLived: number;
  currentWeekLabel?: string;
  currentWeekRef?: Ref<HTMLButtonElement>;
}

const DOTS = Array.from({ length: WEEKS_PER_ROW }, (_, index) => index);

function getDotClassName(
  index: number,
  weeksLived: number,
  showCurrentWeek: boolean,
) {
  if (showCurrentWeek && index === weeksLived) {
    return "bg-accent ring-1 ring-accent/60";
  }

  if (index < weeksLived) {
    return "bg-accent";
  }

  return "bg-text/15";
}

export function LifeGrid({
  showCurrentWeek,
  totalDots,
  weeksLived,
  currentWeekLabel,
  currentWeekRef,
}: LifeGridProps) {
  const rows = Math.ceil(totalDots / WEEKS_PER_ROW);

  return (
    <div className="flex min-w-0 flex-col" data-total-dots={totalDots}>
      {Array.from({ length: rows }, (_, rowIndex) => {
        const age = rowIndex + 1;

        return (
          <div
            className="grid h-2.5 min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2"
            key={age}
          >
            <span
              aria-hidden="true"
              className="text-right text-[10px] text-text-muted/70 tabular-nums leading-[10px]"
            >
              {age === 1 || age % 10 === 0 ? age : ""}
            </span>
            <div
              className="grid min-w-0 gap-px"
              style={{
                gridTemplateColumns: `repeat(${WEEKS_PER_ROW}, minmax(0, 1fr))`,
              }}
            >
              {DOTS.map((weekIndex) => {
                const dotIndex = rowIndex * WEEKS_PER_ROW + weekIndex;
                if (dotIndex >= totalDots) return null;

                const isCurrentWeek =
                  showCurrentWeek && dotIndex === weeksLived;
                const dot = (
                  <span
                    aria-hidden={!isCurrentWeek}
                    className={`block aspect-square w-full max-w-2 justify-self-center rounded-[2px] ${getDotClassName(dotIndex, weeksLived, showCurrentWeek)} ${isCurrentWeek ? "motion-safe:animate-pulse" : ""}`}
                    key={dotIndex}
                    title={
                      isCurrentWeek ? undefined : getLifeDotLabel(dotIndex + 1)
                    }
                  />
                );

                if (!isCurrentWeek || !currentWeekLabel) return dot;

                return (
                  <Tooltip key={dotIndex} placement="top">
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={currentWeekLabel}
                        className="flex min-w-0 appearance-none items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        ref={currentWeekRef}
                      >
                        {dot}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{currentWeekLabel}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
