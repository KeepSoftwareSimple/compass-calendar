import { type MutableRefObject, type ReactNode, type RefCallback } from "react";
import { type Dayjs } from "@core/util/date/dayjs";

export interface GridVisibleDate {
  date: Dayjs;
  key: string;
  surfaceLabel?: string;
  /** Resolved event fill hex for subtle all-day column wash */
  allDayTintColor?: string;
}

export interface GridMeasurement {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
}

export interface GridMeasurements {
  allDayRow: GridMeasurement | null;
  colWidths: number[];
  hourHeight: number;
  mainGrid: GridMeasurement | null;
}

export interface GridRefs {
  allDayColumnsRef: MutableRefObject<HTMLDivElement | null>;
  allDayRef: RefCallback<HTMLDivElement>;
  allDayRowRef: RefCallback<HTMLElement>;
  mainGridElementRef: RefCallback<HTMLElement>;
  mainGridRef: MutableRefObject<HTMLElement | null>;
  timedColumnsElementRef: RefCallback<HTMLDivElement>;
  timedColumnsRef: MutableRefObject<HTMLDivElement | null>;
}

export interface EventPosition {
  height: number;
  left: number;
  top: number;
  width: number;
  zIndex?: number;
}

export interface GridRenderLayers {
  allDayEvents: ReactNode;
  timedEvents: ReactNode;
}
