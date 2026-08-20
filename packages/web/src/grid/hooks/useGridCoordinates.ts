import { type MutableRefObject } from "react";
import dayjs from "@core/util/date/dayjs";
import { roundToPrev } from "@web/common/utils/round/round.util";
import { GRID_TIME_STEP } from "@web/grid/grid.constants";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";

export const useGridCoordinates = (
  measurements: GridMeasurements,
  mainGridRef: MutableRefObject<HTMLElement | null>,
  visibleDates: GridVisibleDate[],
) => {
  const marginLeft = useGridMarginLeft();
  const getVisibleDateIndexByX = (x: number) => {
    const gridLeft =
      mainGridRef.current?.getBoundingClientRect().left ??
      measurements.mainGrid?.left ??
      0;
    const gridX = Math.max(0, x - gridLeft - marginLeft);
    let dateIndex = 0;
    const totalWidth = measurements.colWidths.reduce((left, width, index) => {
      if (gridX >= left && gridX < left + width) {
        dateIndex = index;
      }
      return left + width;
    }, 0);

    if (gridX >= totalWidth) {
      dateIndex = visibleDates.length - 1;
    }

    return Math.max(0, Math.min(dateIndex, visibleDates.length - 1));
  };

  const getMinuteByY = (y: number) => {
    if (!measurements.mainGrid) return 0;

    const scrollTop = mainGridRef.current?.scrollTop || 0;
    const gridY = y - measurements.mainGrid.top + scrollTop;
    const decimalMinute = (gridY / measurements.hourHeight) * 60;
    const flooredMinute = roundToPrev(decimalMinute, GRID_TIME_STEP);

    return Math.max(0, flooredMinute);
  };

  const getDateByXY = (x: number, y: number) => {
    const visibleDate = visibleDates[getVisibleDateIndexByX(x)]?.date;

    return (visibleDate ?? dayjs()).add(getMinuteByY(y), "minutes");
  };

  const getDateStrByXY = (x: number, y: number, format?: string) => {
    const date = getDateByXY(x, y);

    if (format) {
      return date.format(format);
    }
    return date.format();
  };

  const getYByDate = (date: string) => {
    const day = dayjs(date);
    return measurements.hourHeight * (day.hour() + day.minute() / 60);
  };

  return {
    getDateByXY,
    getDateStrByXY,
    getMinuteByY,
    getVisibleDateIndexByX,
    getYByDate,
  };
};

export type GridCoordinates = ReturnType<typeof useGridCoordinates>;
