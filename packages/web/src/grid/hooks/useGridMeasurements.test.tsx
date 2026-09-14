import { act, renderHook } from "@testing-library/react";
import { useGridMeasurements } from "./useGridMeasurements";
import { describe, expect, it, mock } from "bun:test";

const elementWithRect = (width: number, height = 780) => {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
    }) as DOMRect;
  return element;
};

describe("useGridMeasurements", () => {
  it("measures seven visible dates", () => {
    const { result } = renderHook(() =>
      useGridMeasurements({ visibleDateCount: 7 }),
    );

    act(() => {
      result.current.gridRefs.allDayRef(elementWithRect(700));
      result.current.gridRefs.mainGridElementRef(elementWithRect(700));
    });

    expect(result.current.measurements.colWidths).toEqual([
      100, 100, 100, 100, 100, 100, 100,
    ]);
  });

  it("measures one visible date", () => {
    const { result } = renderHook(() =>
      useGridMeasurements({ visibleDateCount: 1 }),
    );

    act(() => {
      result.current.gridRefs.allDayRef(elementWithRect(320));
      result.current.gridRefs.mainGridElementRef(elementWithRect(320));
    });

    expect(result.current.measurements.colWidths).toEqual([320]);
  });

  it("does not update measurements while calendar motion is active", () => {
    const isInteractionMotionActive = mock(() => false);
    const { result } = renderHook(() =>
      useGridMeasurements({ visibleDateCount: 1, isInteractionMotionActive }),
    );

    act(() => {
      result.current.gridRefs.allDayRef(elementWithRect(320));
    });

    isInteractionMotionActive.mockImplementation(() => true);

    act(() => {
      result.current.gridRefs.allDayRef(elementWithRect(640));
    });

    expect(result.current.measurements.colWidths).toEqual([320]);
  });

  it("keeps measurement ref callbacks stable across re-renders", () => {
    const { result, rerender } = renderHook(() =>
      useGridMeasurements({ visibleDateCount: 7 }),
    );

    const {
      allDayRef,
      allDayRowRef,
      mainGridElementRef,
      timedColumnsElementRef,
    } = result.current.gridRefs;
    const firstGridRefs = result.current.gridRefs;

    rerender();

    expect(result.current.gridRefs.allDayRef).toBe(allDayRef);
    expect(result.current.gridRefs.allDayRowRef).toBe(allDayRowRef);
    expect(result.current.gridRefs.mainGridElementRef).toBe(mainGridElementRef);
    expect(result.current.gridRefs.timedColumnsElementRef).toBe(
      timedColumnsElementRef,
    );
    expect(result.current.gridRefs).toBe(firstGridRefs);
  });
});
