export const roundToNext = (number: number, roundBy: number): number =>
  Math.ceil(number / roundBy) * roundBy;

export const roundToPrev = (number: number, roundBy: number): number =>
  Math.floor(number / roundBy) * roundBy;
