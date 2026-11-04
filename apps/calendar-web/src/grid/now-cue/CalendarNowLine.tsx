import cn from "classnames";
import { ZIndex } from "@web/common/constants/web.constants";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { accentGradient } from "@web/common/styles/theme.util";
import { timedGridTopPercent } from "@web/grid/grid.constants";
import { CalendarNowTimeLabel } from "@web/grid/now-cue/CalendarNowTimeLabel";
import {
  formatNowLineTimeLabel,
  nowLineGridMinutes,
} from "@web/grid/now-cue/now-line-time.util";
import { useNowCuePulse } from "@web/grid/now-cue/useNowCuePulse";

type CalendarNowLineProps = {
  columnCount: number;
  columnIndex: number;
  effectiveTimeZone: string;
  showColumnEdgeTimeLabel: boolean;
};

export function CalendarNowLine({
  columnCount,
  columnIndex,
  effectiveTimeZone,
  showColumnEdgeTimeLabel,
}: CalendarNowLineProps) {
  const now = useMinuteTick();
  const minutesFromMidnight = nowLineGridMinutes(now, effectiveTimeZone);
  const topPercent = timedGridTopPercent(minutesFromMidnight);
  const timeLabel = formatNowLineTimeLabel(now, effectiveTimeZone);
  const { pulsing: pulseNowLine, pulseKey } = useNowCuePulse();

  return (
    <div
      aria-hidden="true"
      className="absolute"
      style={{
        top: `${topPercent}%`,
        left: `calc(${columnIndex} * 100% / ${columnCount})`,
        width: `calc(100% / ${columnCount})`,
        zIndex: ZIndex.LAYER_2,
      }}
    >
      {showColumnEdgeTimeLabel ? (
        <CalendarNowTimeLabel
          label={timeLabel}
          topPercent={0}
          variant="column-edge"
        />
      ) : null}
      <div
        className={cn(
          "c-now-line-rim absolute top-0 h-px w-full",
          pulseNowLine && "c-now-cue-pulse",
        )}
        key={pulseKey("now-line")}
        style={{ background: accentGradient }}
      />
    </div>
  );
}
