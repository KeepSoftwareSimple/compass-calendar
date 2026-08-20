import { gridMarginLeftFor } from "@web/grid/grid.constants";
import {
  getTimeTravelZone,
  useTimeTravelZone,
} from "@web/timezone/time-travel.store";

export function gridMarginLeftPx(): number {
  return gridMarginLeftFor(getTimeTravelZone() !== null);
}

export function useGridMarginLeft(): number {
  return gridMarginLeftFor(useTimeTravelZone() !== null);
}
