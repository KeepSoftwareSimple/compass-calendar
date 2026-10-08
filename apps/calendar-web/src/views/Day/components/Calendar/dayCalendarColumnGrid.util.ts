import { EVENT_WIDTH_MINIMUM } from "@web/grid/grid.constants";

export const dayCalendarColumnCountStyle = (columnCount: number) =>
  columnCount > 0
    ? ({
        gridTemplateColumns: `repeat(${columnCount}, minmax(${EVENT_WIDTH_MINIMUM}px, 1fr))`,
        minWidth: columnCount * EVENT_WIDTH_MINIMUM,
      } as const)
    : undefined;
