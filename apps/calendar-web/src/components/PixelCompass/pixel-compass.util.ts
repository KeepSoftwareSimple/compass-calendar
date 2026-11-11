/**
 * Frame math for the pixel compass loader. The needle is rasterized onto a
 * 24×24 grid per frame (rather than CSS-rotated) so it stays crisp pixel art
 * at every angle, matching the PixelPirate sprites.
 */

export const COMPASS_GRID = 24;
export const COMPASS_FPS = 10;
const LOOP_SECONDS = 4;
export const COMPASS_FRAME_COUNT = LOOP_SECONDS * COMPASS_FPS;
/** Frame 0 points due north, so it doubles as the reduced-motion still. */
export const COMPASS_REST_FRAME = 0;

const COLORS = {
  bezel: "var(--accent)",
  brass: "#d9a441",
  face: "#f7f1e3",
  north: "#c0503a",
  south: "#0d1017",
  tick: "#5A6570",
  minorTick: "#c2c6cc",
} as const;

export interface PixelRun {
  x: number;
  y: number;
  width: number;
  fill: string;
}

const SPIN_END = 1.4;
const SETTLE_END = 3.3;

/**
 * Needle heading in radians, clockwise from north. Spins up, overshoots,
 * wobbles onto north, then holds. Every phase meets the next at the same
 * heading (mod 2π), so the loop has no visible jump.
 */
export function compassHeading(seconds: number): number {
  const t = ((seconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  if (t < SPIN_END) return 3 * Math.PI * (t / SPIN_END) ** 2;
  if (t < SETTLE_END) {
    const u = t - SPIN_END;
    return 4 * Math.PI - Math.PI * Math.exp(-2.6 * u) * Math.cos(9 * u);
  }
  return 0;
}

const CARDINAL_TICKS: ReadonlyArray<readonly [number, number]> = [
  [11, 3],
  [12, 3],
  [11, 20],
  [12, 20],
  [3, 11],
  [3, 12],
  [20, 11],
  [20, 12],
];
const MINOR_TICKS: ReadonlyArray<readonly [number, number]> = [
  [6, 6],
  [17, 6],
  [6, 17],
  [17, 17],
];

/** Fill for every pixel of the grid (null = transparent) at a heading. */
export function rasterizeCompass(heading: number): (string | null)[][] {
  const center = COMPASS_GRID / 2;
  const dirX = Math.sin(heading);
  const dirY = -Math.cos(heading);
  const needleAt = (dx: number, dy: number, minHalfWidth: number) => {
    const along = dx * dirX + dy * dirY;
    const perp = Math.abs(dx * dirY - dy * dirX);
    const halfWidth = Math.max(1.4 * (1 - Math.abs(along) / 7.6), minHalfWidth);
    return Math.abs(along) < 7.6 && perp < halfWidth ? along : null;
  };

  const grid: (string | null)[][] = [];
  for (let y = 0; y < COMPASS_GRID; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < COMPASS_GRID; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const r = Math.hypot(dx, dy);
      let fill: string | null = null;
      if (r < 11.3) fill = COLORS.bezel;
      if (r < 10) fill = COLORS.brass;
      if (r < 9.3) {
        fill = COLORS.face;
        // 0.55 keeps a full 2px tip when the needle sits between two pixel
        // columns (due north); anything under 0.5 drops the tip entirely.
        const along = needleAt(dx, dy, 0.55);
        if (along !== null) fill = along > 0 ? COLORS.north : COLORS.south;
        if (r < 1.2) fill = COLORS.brass;
      }
      row.push(fill);
    }
    grid.push(row);
  }

  // Ticks sit under the needle, so skip any the needle currently covers.
  for (const [x, y] of CARDINAL_TICKS) {
    if (needleAt(x + 0.5 - center, y + 0.5 - center, 0.9) === null) {
      grid[y][x] = COLORS.tick;
    }
  }
  for (const [x, y] of MINOR_TICKS) grid[y][x] = COLORS.minorTick;

  return grid;
}

/** Merge each row's same-colored neighbors so a frame is ~100 rects, not 576. */
function toRuns(grid: (string | null)[][]): PixelRun[] {
  const runs: PixelRun[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === fill) end++;
      if (fill) runs.push({ x, y, width: end - x, fill });
      x = end;
    }
  });
  return runs;
}

const frameCache = new Map<number, PixelRun[]>();

export function compassFrame(frame: number): PixelRun[] {
  const index =
    ((frame % COMPASS_FRAME_COUNT) + COMPASS_FRAME_COUNT) % COMPASS_FRAME_COUNT;
  let runs = frameCache.get(index);
  if (!runs) {
    runs = toRuns(rasterizeCompass(compassHeading(index / COMPASS_FPS)));
    frameCache.set(index, runs);
  }
  return runs;
}
