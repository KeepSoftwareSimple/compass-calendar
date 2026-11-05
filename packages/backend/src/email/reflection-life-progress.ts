import { DEFAULT_LIFESPAN, getTotalLifeDots } from "@core/life/life-math";

export function reflectionLifePercent(completedWeeks: number): number {
  return Math.min(
    100,
    Math.max(
      0,
      Math.round((completedWeeks / getTotalLifeDots(DEFAULT_LIFESPAN)) * 100),
    ),
  );
}

export function reflectionLifeProgress(completedWeeks: number): string {
  return `${reflectionLifePercent(completedWeeks)}% done (${DEFAULT_LIFESPAN}-year average)`;
}
