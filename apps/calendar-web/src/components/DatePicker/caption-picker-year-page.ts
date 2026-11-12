/** Keep in sync with `DatePickerCaption.yearsPerPage` on macOS. */
export const CAPTION_YEARS_PER_PAGE = 20;

export type YearPageBounds = { readonly start: number; readonly end: number };

/**
 * react-datepicker year picker (`yearItemNumber`): 20-year pages
 * 1–20, 21–40, …, 1981–2000 (same grid the library paints).
 */
export const reactDatepickerYearPageBounds = (
  year: number,
  pageSize = CAPTION_YEARS_PER_PAGE,
): YearPageBounds => {
  const block = Math.floor((year - 1) / pageSize);
  const start = block * pageSize + 1;
  return { start, end: start + pageSize - 1 };
};

export const shiftYearPageBounds = (
  bounds: YearPageBounds,
  direction: -1 | 1,
  pageSize = CAPTION_YEARS_PER_PAGE,
): YearPageBounds => {
  const block = Math.floor((bounds.start - 1) / pageSize);
  const start = (block + direction) * pageSize + 1;
  return { start, end: start + pageSize - 1 };
};

export const yearRangeCaptionFromBounds = (bounds: YearPageBounds): string => {
  const { start, end } = bounds;
  return start === end ? `Year ${start}` : `Years ${start} to ${end}`;
};
