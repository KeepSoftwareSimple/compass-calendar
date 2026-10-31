import dayjs, { type Dayjs } from "@core/util/date/dayjs";

/** Minutes before start when an upcoming event enters the Up Next nudge. */
export const UP_NEXT_NUDGE_LEAD_MINUTES = 2;

export interface UpNextNudgeCandidate {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}

export interface UpNextNudgeWindow {
  /** Current events (soonest end first), then upcoming within the lead window. */
  occurrences: UpNextNudgeCandidate[];
  primary: UpNextNudgeCandidate | undefined;
  /** True when the primary occurrence is in progress. */
  isPrimaryCurrent: boolean;
  /** True when any occurrence is in progress. */
  hasCurrentEvent: boolean;
}

type ParsedCandidate = UpNextNudgeCandidate & { start: Dayjs; end: Dayjs };

function parseCandidates(
  candidates: readonly UpNextNudgeCandidate[],
): ParsedCandidate[] {
  return candidates.flatMap((candidate) => {
    const start = dayjs(candidate.startDate);
    const end = dayjs(candidate.endDate);
    if (!start.isValid() || !end.isValid()) return [];
    return [{ ...candidate, start, end }];
  });
}

export function projectUpNextNudgeWindow(
  candidates: readonly UpNextNudgeCandidate[],
  now: Dayjs,
  leadMinutes: number = UP_NEXT_NUDGE_LEAD_MINUTES,
): UpNextNudgeWindow {
  const parsed = parseCandidates(candidates);

  const current = parsed
    .filter(({ start, end }) => start.isSameOrBefore(now) && end.isAfter(now))
    .sort((a, b) => a.end.valueOf() - b.end.valueOf());

  const upcoming = parsed
    .filter(
      ({ start }) =>
        start.isAfter(now) && start.diff(now, "minute", true) <= leadMinutes,
    )
    .sort((a, b) => a.start.valueOf() - b.start.valueOf());

  const occurrences = [...current, ...upcoming].map(
    ({ id, title, startDate, endDate }) => ({
      id,
      title,
      startDate,
      endDate,
    }),
  );

  const primary = occurrences[0];
  const isPrimaryCurrent = primary
    ? current.some((event) => event.id === primary.id)
    : false;

  return {
    occurrences,
    primary,
    isPrimaryCurrent,
    hasCurrentEvent: current.length > 0,
  };
}

/** Compact banner line when more than one event is in the nudge window. */
export function formatUpNextNudgeMultiSummary(
  count: number,
  hasCurrentEvent: boolean,
): string {
  if (count <= 1) {
    throw new Error("formatUpNextNudgeMultiSummary requires count > 1");
  }
  if (hasCurrentEvent) {
    return `${count} events now`;
  }
  return `${count} events starting soon`;
}

export function upNextPickerTitle(
  count: number,
  hasCurrentEvent: boolean,
): string {
  const plural = count === 1 ? "" : "s";
  if (hasCurrentEvent) {
    return `You have ${count} event${plural}. Select which event to open`;
  }
  return `You have ${count} upcoming event${plural}. Select which event to open`;
}
