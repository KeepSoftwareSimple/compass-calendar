import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { TIMED_VISIBLE_HOURS } from "@web/grid/grid.constants";
import {
  type GridMeasurement,
  type GridMeasurements,
  type GridRefs,
} from "@web/grid/types/grid.types";

const toMeasurementSnapshot = (rect: DOMRectReadOnly): GridMeasurement => ({
  bottom: rect.bottom,
  height: rect.height,
  left: rect.left,
  right: rect.right,
  top: rect.top,
  width: rect.width,
  x: rect.x,
  y: rect.y,
});

const areMeasurementsEqual = (
  current: GridMeasurement | null | undefined,
  next: GridMeasurement,
) => {
  return (
    current?.bottom === next.bottom &&
    current.height === next.height &&
    current.left === next.left &&
    current.right === next.right &&
    current.top === next.top &&
    current.width === next.width &&
    current.x === next.x &&
    current.y === next.y
  );
};

const defaultIsInteractionMotionActive = () => false;

export const useGridMeasurements = ({
  isInteractionMotionActive = defaultIsInteractionMotionActive,
  visibleDateCount,
}: {
  isInteractionMotionActive?: () => boolean;
  visibleDateCount: number;
}) => {
  const safeVisibleDateCount = Math.max(1, visibleDateCount);

  const [allDayMeasurements, setAllDayMeasurements] =
    useState<GridMeasurement | null>(null);
  const [allDayColumnsMeasurements, setAllDayColumnsMeasurements] =
    useState<GridMeasurement | null>(null);
  const [mainMeasurements, setMainMeasurements] =
    useState<GridMeasurement | null>(null);

  const allDayColumnsRef = useRef<HTMLDivElement | null>(null);
  const mainGridRef = useRef<HTMLElement | null>(null);
  const timedColumnsRef = useRef<HTMLDivElement | null>(null);
  const observersRef = useRef(new Map<string, ResizeObserver>());

  const observeElement = useCallback(
    (
      key: string,
      node: HTMLElement | null,
      setMeasurement: Dispatch<SetStateAction<GridMeasurement | null>>,
    ) => {
      observersRef.current.get(key)?.disconnect();
      observersRef.current.delete(key);

      if (!node) {
        return;
      }

      const measure = () => {
        if (isInteractionMotionActive()) return;

        const next = toMeasurementSnapshot(node.getBoundingClientRect());
        setMeasurement((current) => {
          if (isInteractionMotionActive()) return current;
          return areMeasurementsEqual(current, next) ? current : next;
        });
      };

      measure();

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const observer = new ResizeObserver(measure);
      observer.observe(node);
      observersRef.current.set(key, observer);
    },
    [isInteractionMotionActive],
  );

  const allDayRowRef = useCallback(
    (node: HTMLElement | null) => {
      observeElement("allDayRow", node, setAllDayMeasurements);
    },
    [observeElement],
  );

  const allDayRef = useCallback(
    (node: HTMLDivElement | null) => {
      allDayColumnsRef.current = node;
      observeElement("allDayColumns", node, setAllDayColumnsMeasurements);
    },
    [observeElement],
  );

  const mainGridElementRef = useCallback(
    (node: HTMLElement | null) => {
      mainGridRef.current = node;
      observeElement("mainGrid", node, setMainMeasurements);
    },
    [observeElement],
  );

  const timedColumnsElementRef = useCallback((node: HTMLDivElement | null) => {
    timedColumnsRef.current = node;
  }, []);

  const colWidths = useMemo(
    () =>
      allDayColumnsMeasurements?.width
        ? Array(safeVisibleDateCount).fill(
            allDayColumnsMeasurements.width / safeVisibleDateCount,
          )
        : [],
    [allDayColumnsMeasurements?.width, safeVisibleDateCount],
  );

  const gridRefs: GridRefs = useMemo(
    () => ({
      allDayRef,
      allDayColumnsRef,
      allDayRowRef,
      mainGridElementRef,
      mainGridRef,
      timedColumnsElementRef,
      timedColumnsRef,
    }),
    // allDayColumnsRef/mainGridRef/timedColumnsRef are refs - stable identity,
    // no need to depend on them.
    [allDayRef, allDayRowRef, mainGridElementRef, timedColumnsElementRef],
  );

  const measurements: GridMeasurements = useMemo(
    () => ({
      allDayRow: allDayMeasurements,
      colWidths,
      hourHeight: mainMeasurements?.height
        ? mainMeasurements.height / TIMED_VISIBLE_HOURS
        : 0,
      mainGrid: mainMeasurements,
    }),
    [allDayMeasurements, colWidths, mainMeasurements],
  );

  return {
    gridRefs,
    measurements,
  };
};

export type GridMeasurementsState = ReturnType<typeof useGridMeasurements>;
