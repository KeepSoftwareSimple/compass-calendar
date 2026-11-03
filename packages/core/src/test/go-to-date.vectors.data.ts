/**
 * Shared go-to-date parse and announcement inputs for web unit tests,
 * desktop-export JSON (macOS GoToDateParityTests), and fixture emitters.
 * Expected outputs are computed at runtime in each consumer.
 */
export const GO_TO_DATE_REFERENCE_NOW_ISO = "2026-09-15T12:00:00.000Z";

export const GO_TO_DATE_ANNOUNCEMENT_TARGET_YMD = "2026-10-03";

export type GoToDateParseVector = {
  readonly input: string;
  readonly expectedYmd: string | null;
};

/** Canonical parse/reject cases at {@link GO_TO_DATE_REFERENCE_NOW_ISO}. */
export const GO_TO_DATE_PARSE_VECTORS: readonly GoToDateParseVector[] = [
  { input: "2026-10-03", expectedYmd: "2026-10-03" },
  { input: "2026-10-29", expectedYmd: "2026-10-29" },
  { input: "2026/10/29", expectedYmd: "2026-10-29" },
  { input: "2026/10/03", expectedYmd: "2026-10-03" },
  { input: "2026.10.29", expectedYmd: "2026-10-29" },
  { input: "10/3", expectedYmd: "2026-10-03" },
  { input: "10/29", expectedYmd: "2026-10-29" },
  { input: "10-29", expectedYmd: "2026-10-29" },
  { input: "10.29.2026", expectedYmd: "2026-10-29" },
  { input: "10/3/2026", expectedYmd: "2026-10-03" },
  { input: "10/29/2026", expectedYmd: "2026-10-29" },
  { input: "10/3/26", expectedYmd: "2026-10-03" },
  { input: "10/29/26", expectedYmd: "2026-10-29" },
  { input: "29/10", expectedYmd: "2026-10-29" },
  { input: "29/10/2026", expectedYmd: "2026-10-29" },
  { input: "oct 3", expectedYmd: "2026-10-03" },
  { input: "Oct 29", expectedYmd: "2026-10-29" },
  { input: "october 29", expectedYmd: "2026-10-29" },
  { input: "3 oct", expectedYmd: "2026-10-03" },
  { input: "29 Oct", expectedYmd: "2026-10-29" },
  { input: "october 3 2026", expectedYmd: "2026-10-03" },
  { input: "Oct 29 2026", expectedYmd: "2026-10-29" },
  { input: "2026-10", expectedYmd: "2026-10-01" },
  { input: "2026/10", expectedYmd: "2026-10-01" },
  { input: "october 2026", expectedYmd: "2026-10-01" },
  { input: "oct 2026", expectedYmd: "2026-10-01" },
  { input: "2026 october", expectedYmd: "2026-10-01" },
  { input: "2/30", expectedYmd: null },
  { input: "32/1", expectedYmd: null },
  { input: "oct", expectedYmd: null },
  { input: "hello", expectedYmd: null },
];

export type GoToDateYearInferenceVector = {
  readonly input: string;
  readonly nowIso: string;
  readonly expectedYmd: string;
};

/** Omitted-year resolution uses a different reference instant per case. */
export const GO_TO_DATE_YEAR_INFERENCE_VECTORS: readonly GoToDateYearInferenceVector[] =
  [
    {
      input: "jan 3",
      nowIso: GO_TO_DATE_REFERENCE_NOW_ISO,
      expectedYmd: "2027-01-03",
    },
    {
      input: "mar 14",
      nowIso: GO_TO_DATE_REFERENCE_NOW_ISO,
      expectedYmd: "2027-03-14",
    },
    {
      input: "mar 15",
      nowIso: GO_TO_DATE_REFERENCE_NOW_ISO,
      expectedYmd: "2026-03-15",
    },
    {
      input: "10/29",
      nowIso: "2027-04-15T12:00:00.000Z",
      expectedYmd: "2027-10-29",
    },
  ];
