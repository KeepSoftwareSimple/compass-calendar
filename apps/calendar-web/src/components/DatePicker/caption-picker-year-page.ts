/** Keep in sync with `DatePickerCaption.yearsPerPage` / `yearPage` on macOS. */
export const CAPTION_YEARS_PER_PAGE = 20;

export const yearPageContaining = (
  year: number,
  pageSize = CAPTION_YEARS_PER_PAGE,
): readonly number[] => {
  const start = year - (((year % pageSize) + pageSize) % pageSize);
  return Array.from({ length: pageSize }, (_, index) => start + index);
};

/** macOS `DatePickerCaption.yearPage` / `yearRangeCaption` alignment. */
export const yearRangeCaption = (
  anchorYear: number,
  pageSize = CAPTION_YEARS_PER_PAGE,
): string => {
  const page = yearPageContaining(anchorYear, pageSize);
  const first = page[0];
  const last = page[page.length - 1];
  if (first === undefined || last === undefined) return "Select year";
  return first === last ? `Year ${first}` : `Years ${first} to ${last}`;
};

/** react-datepicker year grid: `yearItemNumber` years ending on `monthDate`'s year. */
export const reactDatepickerYearRangeCaption = (
  endYear: number,
  pageSize = CAPTION_YEARS_PER_PAGE,
): string => {
  const start = endYear - pageSize + 1;
  return start === endYear ? `Year ${endYear}` : `Years ${start} to ${endYear}`;
};
