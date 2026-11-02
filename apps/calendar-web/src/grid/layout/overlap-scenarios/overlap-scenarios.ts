import { Origin } from "@core/constants/core.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";

/** Column widths the corpus is held to: week column, wide week, day view. */
export const OVERLAP_SCENARIO_COLUMN_WIDTHS = [140, 220, 600] as const;
export type OverlapScenarioColumnWidth =
  (typeof OVERLAP_SCENARIO_COLUMN_WIDTHS)[number];

/** Minimum `good` and maximum `poor` card counts at a column width. */
export interface ReadabilityFloor {
  good: number;
  poor: number;
}

export interface OverlapScenario {
  /** `[title, "HH:mm" start, "HH:mm" end]` on {@link OVERLAP_SCENARIO_DAY}. */
  events: readonly (readonly [string, string, string])[];
  floors: Record<OverlapScenarioColumnWidth, ReadabilityFloor>;
  id: string;
}

export const OVERLAP_SCENARIO_DAY = "2026-11-02";
export const OVERLAP_SCENARIO_ZONE = "America/Denver";

/**
 * One fixture per overlap shape. An overlap bug fix adds its shape here and
 * must keep every other scenario's floor. Floors may rise; lowering one is
 * a deliberate edit that review sees in the diff. A `poor` floor above zero
 * names a limit of the 140px week column: starts within half an hour of
 * each other that it cannot fit side by side at a readable width.
 */
export const OVERLAP_SCENARIOS: readonly OverlapScenario[] = [
  {
    id: "same-start pair",
    events: [
      ["Unwind", "19:00", "20:00"],
      ["Monthly Ritual", "19:00", "20:30"],
    ],
    floors: {
      140: { good: 0, poor: 0 },
      220: { good: 2, poor: 0 },
      600: { good: 2, poor: 0 },
    },
  },
  {
    id: "same-start trio",
    events: [
      ["Dinner", "18:00", "19:00"],
      ["Team trivia", "18:00", "19:00"],
      ["Call Mom", "18:00", "18:30"],
    ],
    floors: {
      140: { good: 0, poor: 3 },
      220: { good: 0, poor: 0 },
      600: { good: 3, poor: 0 },
    },
  },
  {
    id: "hand-off chain",
    events: [
      ["Product sync", "09:00", "10:00"],
      ["Design crit", "09:45", "11:00"],
      ["Hiring debrief", "10:30", "11:30"],
      ["Lunch with Priya", "11:15", "12:00"],
    ],
    floors: {
      140: { good: 3, poor: 0 },
      220: { good: 4, poor: 0 },
      600: { good: 4, poor: 0 },
    },
  },
  {
    id: "background block with meetings",
    events: [
      ["Focus block", "13:00", "17:00"],
      ["1:1 Alex", "13:30", "14:00"],
      ["Coffee chat", "14:30", "15:00"],
      ["Design review", "15:00", "16:00"],
      ["Candidate interview", "15:15", "16:15"],
      ["School pickup", "16:30", "17:30"],
    ],
    floors: {
      140: { good: 4, poor: 0 },
      220: { good: 4, poor: 0 },
      600: { good: 6, poor: 0 },
    },
  },
  {
    id: "back-to-back short tasks",
    events: [
      ["Pay invoice", "12:30", "12:35"],
      ["Call the bank", "12:35", "13:00"],
    ],
    floors: {
      140: { good: 0, poor: 0 },
      220: { good: 2, poor: 0 },
      600: { good: 2, poor: 0 },
    },
  },
  {
    id: "near start beside a cascade",
    events: [
      ["Standup", "09:00", "10:00"],
      ["Retro", "09:20", "10:20"],
      ["Planning", "09:40", "10:40"],
    ],
    floors: {
      140: { good: 0, poor: 1 },
      220: { good: 2, poor: 0 },
      600: { good: 3, poor: 0 },
    },
  },
  {
    id: "four same-minute starts",
    events: [
      ["Dinner", "18:00", "19:00"],
      ["Team trivia", "18:00", "19:00"],
      ["Call Mom", "18:00", "18:30"],
      ["Order groceries", "18:00", "18:45"],
    ],
    floors: {
      140: { good: 0, poor: 4 },
      220: { good: 0, poor: 0 },
      600: { good: 4, poor: 0 },
    },
  },
  {
    id: "audit demo day",
    events: [
      ["Gym", "07:30", "08:30"],
      ["Breakfast with Sam", "08:00", "08:45"],
      ["Quick check-in", "08:00", "08:15"],
      ["Product sync", "09:00", "10:00"],
      ["Design crit", "09:45", "11:00"],
      ["Hiring debrief", "10:30", "11:30"],
      ["Lunch with Priya", "11:15", "12:00"],
      ["Pay invoice", "12:30", "12:35"],
      ["Call the bank", "12:35", "13:00"],
      ["Focus block", "13:00", "17:00"],
      ["1:1 Alex", "13:30", "14:00"],
      ["Coffee chat", "14:30", "15:00"],
      ["Design review", "15:00", "16:00"],
      ["Candidate interview", "15:15", "16:15"],
      ["School pickup", "16:30", "17:30"],
      ["Dinner", "18:00", "19:00"],
      ["Team trivia", "18:00", "19:00"],
      ["Call Mom", "18:00", "18:30"],
      ["Order groceries", "18:15", "18:45"],
      ["Unwind", "20:00", "21:00"],
    ],
    floors: {
      140: { good: 9, poor: 4 },
      220: { good: 12, poor: 0 },
      600: { good: 20, poor: 0 },
    },
  },
];

export const overlapScenarioGridEvents = (
  scenario: OverlapScenario,
): GridEvent[] =>
  scenario.events.map(([title, start, end], index) => ({
    _id: `${scenario.id}-${index}`,
    description: "",
    endDate: `${OVERLAP_SCENARIO_DAY}T${end}:00-07:00`,
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: undefined,
    startDate: `${OVERLAP_SCENARIO_DAY}T${start}:00-07:00`,
    timeZone: OVERLAP_SCENARIO_ZONE,
    title,
    user: "",
  }));
