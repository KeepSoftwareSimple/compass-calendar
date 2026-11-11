import {
  COMPASS_FPS,
  COMPASS_FRAME_COUNT,
  COMPASS_GRID,
  COMPASS_REST_FRAME,
  compassFrame,
  compassHeading,
  rasterizeCompass,
} from "@web/components/PixelCompass/pixel-compass.util";
import { describe, expect, it } from "bun:test";

const NORTH = "#c0503a";
const SOUTH = "#0d1017";
const TAU = 2 * Math.PI;
const normalize = (a: number) => ((a % TAU) + TAU) % TAU;
const angularGap = (a: number, b: number) => {
  const d = Math.abs(normalize(a) - normalize(b));
  return Math.min(d, TAU - d);
};

describe("compassHeading", () => {
  it("starts and rests on north", () => {
    expect(normalize(compassHeading(0))).toBeCloseTo(0);
    expect(normalize(compassHeading(3.5))).toBeCloseTo(0);
  });

  it("loops without a visible jump between frames", () => {
    for (let frame = 0; frame < COMPASS_FRAME_COUNT; frame++) {
      const here = compassHeading(frame / COMPASS_FPS);
      const next = compassHeading((frame + 1) / COMPASS_FPS);
      // The fastest spin moves under 135° per frame; a seam would be a jump.
      expect(angularGap(here, next)).toBeLessThan((3 * Math.PI) / 4);
    }
  });

  it("actually moves during the spin", () => {
    expect(angularGap(compassHeading(0), compassHeading(1))).toBeGreaterThan(
      0.5,
    );
  });
});

describe("rasterizeCompass", () => {
  it("draws the red tip above the hub and the dark tail below when facing north", () => {
    const grid = rasterizeCompass(0);
    const center = COMPASS_GRID / 2;
    const rowsWith = (fill: string) =>
      grid.flatMap((row, y) => (row.includes(fill) ? [y] : []));

    expect(rowsWith(NORTH).every((y) => y < center)).toBe(true);
    expect(rowsWith(SOUTH).every((y) => y >= center)).toBe(true);
    expect(rowsWith(NORTH).length).toBeGreaterThan(4);
  });

  it("leaves the corners transparent so it sits on any background", () => {
    const grid = rasterizeCompass(0);
    expect(grid[0][0]).toBeNull();
    expect(grid[COMPASS_GRID - 1][COMPASS_GRID - 1]).toBeNull();
  });
});

describe("compassFrame", () => {
  it("wraps frame indexes and covers every pixel exactly once per run", () => {
    expect(compassFrame(COMPASS_FRAME_COUNT)).toBe(
      compassFrame(COMPASS_REST_FRAME),
    );
    const runs = compassFrame(7);
    const painted = new Set<string>();
    for (const { x, y, width } of runs) {
      for (let i = x; i < x + width; i++) {
        const key = `${i},${y}`;
        expect(painted.has(key)).toBe(false);
        painted.add(key);
      }
    }
    expect(runs.length).toBeLessThan(200);
  });
});
