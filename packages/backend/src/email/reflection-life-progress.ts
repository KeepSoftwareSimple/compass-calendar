import { DEFAULT_LIFESPAN, getTotalLifeDots } from "@core/life/life-math";

export function reflectionLifeProgress(completedWeeks: number): string {
  const percent = Math.min(
    100,
    Math.max(
      0,
      Math.round((completedWeeks / getTotalLifeDots(DEFAULT_LIFESPAN)) * 100),
    ),
  );
  return `${percent}% done (${DEFAULT_LIFESPAN}-year average)`;
}
