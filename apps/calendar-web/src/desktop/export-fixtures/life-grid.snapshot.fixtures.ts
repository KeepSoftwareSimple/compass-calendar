import { ensureDesktopExportEnv } from "@core/desktop/desktop-export-env";
import {
  getTotalLifeDots,
  getWeekLivedCount,
  WEEKS_PER_ROW,
} from "@web/views/Life/life.utils";

ensureDesktopExportEnv();

export type LifeDotState = "future" | "lived" | "current";

export interface LifeGridSnapshotScenario {
  id: string;
  birthDate: string;
  lifespan: number;
  today: string;
  showCurrentWeek: boolean;
}

export interface LifeGridSnapshot {
  totalDots: number;
  weeksLived: number;
  rowCount: number;
  dots: LifeDotState[];
}

const dotState = (
  index: number,
  weeksLived: number,
  showCurrentWeek: boolean,
): LifeDotState => {
  if (showCurrentWeek && index === weeksLived) return "current";
  if (index < weeksLived) return "lived";
  return "future";
};

export const buildLifeGridSnapshot = (
  scenario: LifeGridSnapshotScenario,
): LifeGridSnapshot => {
  const today = new Date(scenario.today);
  const totalDots = getTotalLifeDots(scenario.lifespan);
  const weeksLived = getWeekLivedCount(scenario.birthDate, totalDots, today);
  const dots: LifeDotState[] = [];
  for (let index = 0; index < totalDots; index += 1) {
    dots.push(dotState(index, weeksLived, scenario.showCurrentWeek));
  }
  return {
    totalDots,
    weeksLived,
    rowCount: Math.ceil(totalDots / WEEKS_PER_ROW),
    dots,
  };
};

export const buildLifeGridSnapshotFixtures = () => ({
  scenarios: [
    {
      id: "life-grid-average-77",
      scenario: {
        id: "life-grid-average-77",
        birthDate: "2000-01-01",
        lifespan: 77,
        today: "2026-01-01T12:00:00.000",
        showCurrentWeek: true,
      },
      snapshot: buildLifeGridSnapshot({
        id: "life-grid-average-77",
        birthDate: "2000-01-01",
        lifespan: 77,
        today: "2026-01-01T12:00:00.000",
        showCurrentWeek: true,
      }),
    },
    {
      id: "life-grid-long-100",
      scenario: {
        id: "life-grid-long-100",
        birthDate: "1993-09-14",
        lifespan: 100,
        today: "2026-07-21T12:00:00.000",
        showCurrentWeek: true,
      },
      snapshot: buildLifeGridSnapshot({
        id: "life-grid-long-100",
        birthDate: "1993-09-14",
        lifespan: 100,
        today: "2026-07-21T12:00:00.000",
        showCurrentWeek: true,
      }),
    },
    {
      id: "life-grid-no-birth-date",
      scenario: {
        id: "life-grid-no-birth-date",
        birthDate: "",
        lifespan: 77,
        today: "2026-01-01T12:00:00.000",
        showCurrentWeek: true,
      },
      snapshot: buildLifeGridSnapshot({
        id: "life-grid-no-birth-date",
        birthDate: "",
        lifespan: 77,
        today: "2026-01-01T12:00:00.000",
        showCurrentWeek: true,
      }),
    },
  ],
});

export const emitLifeGridSnapshotFixturesJson = (): string =>
  `${JSON.stringify(buildLifeGridSnapshotFixtures(), null, 2)}\n`;
