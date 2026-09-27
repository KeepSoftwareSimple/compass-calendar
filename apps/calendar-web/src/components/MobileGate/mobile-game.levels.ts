import { type EventColorSlot } from "@core/types/event-color.contracts";

/**
 * Time Block Party: the mobile landing game. Three short authored levels of
 * drag-to-place scheduling on a fake grid. Deterministic on purpose so a
 * full run scripts cleanly in tests.
 */

export type MobileSlot = { dayIndex: number; startMin: number };

export type MobileBlock = {
  id: string;
  title: string;
  /** 0-based, left to right. */
  dayIndex: number;
  /** Minutes from midnight. */
  startMin: number;
  endMin: number;
  color?: EventColorSlot;
  /** Seeded "Busy" filler; drops that land on it are misses. */
  decoy?: boolean;
};

export type MobilePiece = {
  id: string;
  title: string;
  color: EventColorSlot;
  durationMin: number;
  target: MobileSlot;
};

export type MobileLevel = {
  id: string;
  title: string;
  dayCount: number;
  dayLabels: readonly string[];
  startHour: number;
  endHour: number;
  /** Snap granularity for drops. */
  slotMin: number;
  /** Levels 1-2 outline the target; level 3 makes the player read the time. */
  showTargetGhost: boolean;
  seedBlocks: readonly MobileBlock[];
  pieces: readonly MobilePiece[];
};

const busy = (
  id: string,
  dayIndex: number,
  startMin: number,
  endMin: number,
): MobileBlock => ({
  id,
  title: "Busy",
  dayIndex,
  startMin,
  endMin,
  color: "slate",
  decoy: true,
});

export const MOBILE_LEVELS: readonly MobileLevel[] = [
  {
    id: "warm-up",
    title: "Warm up",
    dayCount: 1,
    dayLabels: ["Today"],
    startHour: 9,
    endHour: 17,
    slotMin: 60,
    showTargetGhost: true,
    seedBlocks: [],
    pieces: [
      {
        id: "standup",
        title: "Standup",
        color: "blue",
        durationMin: 60,
        target: { dayIndex: 0, startMin: 9 * 60 },
      },
      {
        id: "deep-work",
        title: "Deep work",
        color: "mint",
        durationMin: 60,
        target: { dayIndex: 0, startMin: 10 * 60 },
      },
      {
        id: "lunch",
        title: "Lunch",
        color: "gold",
        durationMin: 60,
        target: { dayIndex: 0, startMin: 12 * 60 },
      },
      {
        id: "gym",
        title: "Gym",
        color: "coral",
        durationMin: 60,
        target: { dayIndex: 0, startMin: 16 * 60 },
      },
    ],
  },
  {
    id: "half-hours",
    title: "Half hours",
    dayCount: 1,
    dayLabels: ["Today"],
    startHour: 9,
    endHour: 17,
    slotMin: 30,
    showTargetGhost: true,
    seedBlocks: [],
    pieces: [
      {
        id: "coffee-chat",
        title: "Coffee chat",
        color: "lavender",
        durationMin: 30,
        target: { dayIndex: 0, startMin: 9 * 60 + 30 },
      },
      {
        id: "design-review",
        title: "Design review",
        color: "blue",
        durationMin: 60,
        target: { dayIndex: 0, startMin: 11 * 60 },
      },
      {
        id: "walk",
        title: "Walk",
        color: "green",
        durationMin: 30,
        target: { dayIndex: 0, startMin: 13 * 60 + 30 },
      },
      {
        id: "focus-block",
        title: "Focus block",
        color: "plum",
        durationMin: 60,
        target: { dayIndex: 0, startMin: 15 * 60 },
      },
    ],
  },
  {
    id: "full-board",
    title: "Full board",
    dayCount: 3,
    dayLabels: ["Mon", "Tue", "Wed"],
    startHour: 9,
    endHour: 17,
    slotMin: 60,
    showTargetGhost: false,
    seedBlocks: [
      busy("busy-mon", 0, 10 * 60, 11 * 60),
      busy("busy-tue", 1, 13 * 60, 14 * 60),
      busy("busy-wed", 2, 9 * 60, 10 * 60),
    ],
    pieces: [
      {
        id: "kickoff",
        title: "Kickoff",
        color: "blue",
        durationMin: 60,
        target: { dayIndex: 0, startMin: 9 * 60 },
      },
      {
        id: "one-on-one",
        title: "1:1 with Sam",
        color: "orange",
        durationMin: 60,
        target: { dayIndex: 1, startMin: 11 * 60 },
      },
      {
        id: "team-lunch",
        title: "Team lunch",
        color: "gold",
        durationMin: 60,
        target: { dayIndex: 2, startMin: 12 * 60 },
      },
      {
        id: "code-review",
        title: "Code review",
        color: "mint",
        durationMin: 60,
        target: { dayIndex: 1, startMin: 15 * 60 },
      },
      {
        id: "retro",
        title: "Retro",
        color: "indigo",
        durationMin: 60,
        target: { dayIndex: 2, startMin: 16 * 60 },
      },
    ],
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Snap a pointer position on the board to a slot the current piece could
 * occupy. The piece centers on the finger vertically. Returns null when the
 * pointer has left the board by more than one slot height (dragging back to
 * the tray cancels); horizontal drift clamps into the nearest day column so
 * a slightly wide thumb still counts.
 */
export const slotFromPointer = (
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  level: MobileLevel,
  durationMin: number,
): MobileSlot | null => {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const totalMin = (level.endHour - level.startHour) * 60;
  const slotHeightPx = rect.height * (level.slotMin / totalMin);
  if (y < rect.top - slotHeightPx) return null;
  if (y > rect.top + rect.height + slotHeightPx) return null;

  const dayIndex = clamp(
    Math.floor(((x - rect.left) / rect.width) * level.dayCount),
    0,
    level.dayCount - 1,
  );

  const gridStartMin = level.startHour * 60;
  const pointerMin = ((y - rect.top) / rect.height) * totalMin + gridStartMin;
  const snapped =
    Math.round((pointerMin - durationMin / 2 - gridStartMin) / level.slotMin) *
      level.slotMin +
    gridStartMin;
  const startMin = clamp(
    snapped,
    gridStartMin,
    level.endHour * 60 - durationMin,
  );
  return { dayIndex, startMin };
};
