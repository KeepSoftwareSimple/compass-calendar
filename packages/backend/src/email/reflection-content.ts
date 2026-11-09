import { REFLECTION_EMAIL_QUOTES } from "@core/life/life-quotes";
import { type ReflectionEvent } from "@core/types/sync/reflection.contracts";
import dayjs from "@core/util/date/dayjs";
import { escapeHtml } from "@core/util/escape-html.util";
import { reflectionLifeProgress } from "@backend/email/reflection-life-progress";
import { type ReflectionCadence } from "@backend/email/reflection-schedule";
import { createHash } from "node:crypto";

const unique = (events: ReflectionEvent[]) => {
  const occurrences = new Set<string>();
  const matchingCalendars = new Map<string, string>();
  return events.filter((event) => {
    const { schedule } = event;
    const start =
      schedule.kind === "timed" ? Date.parse(schedule.start) : schedule.start;
    const end =
      schedule.kind === "timed" ? Date.parse(schedule.end) : schedule.end;
    const occurrence = JSON.stringify([
      event.windowKey,
      event.uid ?? event.id,
      start,
    ]);
    const match = JSON.stringify([
      event.windowKey,
      event.title.trim().replace(/\s+/g, " ").toLowerCase(),
      schedule.kind,
      start,
      end,
    ]);
    const calendar = matchingCalendars.get(match);
    const duplicate =
      occurrences.has(occurrence) ||
      (calendar !== undefined && calendar !== event.calendarId);
    occurrences.add(occurrence);
    if (calendar === undefined) matchingCalendars.set(match, event.calendarId);
    return !duplicate;
  });
};
const rank = (event: ReflectionEvent) =>
  (event.recurring ? 0 : 10) + (event.schedule.kind === "allDay" ? 2 : 0);

export function selectReflectionEvents(input: {
  events: ReflectionEvent[];
  timeZone: string;
  cutoff: Date;
  upcomingCutoff?: Date;
  recentStartDate: string;
  hiddenIds: Set<string>;
  previousMemoryIds: Set<string>;
}) {
  const eligible = unique(
    input.events.filter(
      (event) =>
        event.title.trim() &&
        !input.hiddenIds.has(event.eventId) &&
        !input.hiddenIds.has(event.id) &&
        (!event.seriesId || !input.hiddenIds.has(event.seriesId)),
    ),
  );
  const localDate = (event: ReflectionEvent) =>
    event.schedule.kind === "allDay"
      ? event.schedule.start
      : dayjs(event.schedule.start).tz(input.timeZone).format("YYYY-MM-DD");
  const date = dayjs(input.cutoff).tz(input.timeZone).format("YYYY-MM-DD");
  const completed = (event: ReflectionEvent) =>
    event.schedule.kind === "allDay"
      ? event.schedule.end <= date
      : Date.parse(event.schedule.end) <= input.cutoff.getTime();
  const recent = eligible
    .filter((event) => event.windowKey === "recent" && completed(event))
    .sort(
      (a, b) =>
        rank(b) - rank(a) || a.schedule.start.localeCompare(b.schedule.start),
    );
  const upcoming = eligible
    .filter(
      (event) =>
        event.windowKey === "upcoming" &&
        !event.routine &&
        (event.schedule.kind === "allDay"
          ? event.schedule.start >= date
          : Date.parse(event.schedule.start) >=
            (input.upcomingCutoff ?? input.cutoff).getTime()),
    )
    .sort((a, b) => a.schedule.start.localeCompare(b.schedule.start));
  const history = eligible.filter((event) =>
    event.windowKey.startsWith("history:"),
  );
  const historicalWeekMatch = (event: ReflectionEvent) => {
    const year = event.windowKey.split(":")[1] ?? localDate(event).slice(0, 4);
    // Relative day offset maps cross-year weeks and Feb 29 consistently.
    const offset = dayjs(date).year(Number(year)).diff(dayjs(date), "day");
    const shiftedStart = dayjs(input.recentStartDate)
      .add(offset, "day")
      .format("YYYY-MM-DD");
    const shiftedEnd = dayjs(date).add(offset, "day").format("YYYY-MM-DD");
    return localDate(event) >= shiftedStart && localDate(event) <= shiftedEnd;
  };
  const memories = history
    .sort(
      (a, b) =>
        Number(historicalWeekMatch(b)) - Number(historicalWeekMatch(a)) ||
        Number(input.previousMemoryIds.has(a.id)) -
          Number(input.previousMemoryIds.has(b.id)) ||
        rank(b) - rank(a) ||
        digest(`${date}:${a.id}`).localeCompare(digest(`${date}:${b.id}`)),
    )
    .slice(0, 3);
  return { recent, upcoming, memories, weekMatch: historicalWeekMatch };
}

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function renderReflectionEmail(input: {
  date: string;
  timeZone: string;
  cadence: ReflectionCadence;
  recentStartDate: string;
  upcomingStartDate: string;
  recent: ReflectionEvent[];
  upcoming: ReflectionEvent[];
  memories: ReflectionEvent[];
  weekMatch: (event: ReflectionEvent) => boolean;
  historyComplete: boolean;
  completedWeeks: number | null;
  appUrl: string;
  unsubscribeUrl: string;
}) {
  const reviewDate = dayjs(input.date);
  // The Thursday determines the ISO week, including December/January boundaries.
  const thursday = reviewDate.add(3 - ((reviewDate.day() + 6) % 7), "day");
  const subject = `Weekly review (${Math.ceil(thursday.dayOfYear() / 7)})`;
  const dateRange = (startDate: string, endDate: string) => {
    const start = dayjs(startDate),
      end = dayjs(endDate);
    if (start.year() !== end.year())
      return `${start.format("MMM D, YYYY")} - ${end.format("MMM D, YYYY")}`;
    if (start.month() === end.month())
      return `${start.format("MMM D")}-${end.format("D")}`;
    return `${start.format("MMM D")} - ${end.format("MMM D")}`;
  };
  const calendarDate = (event: ReflectionEvent) =>
    event.schedule.kind === "allDay"
      ? dayjs(event.schedule.start)
      : dayjs(event.schedule.start).tz(input.timeZone);
  const label = (event: ReflectionEvent) => {
    const date = calendarDate(event);
    return `${date.format("ddd, MMM D")}${event.schedule.kind === "timed" ? ` at ${date.format("h:mm a")}` : ""}: ${event.title}`;
  };
  const sections: { heading: string; lines: string[] }[] = [
    {
      heading: `Your past week, ${dateRange(input.recentStartDate, input.cadence === "daily" ? dayjs(input.upcomingStartDate).subtract(1, "day").format("YYYY-MM-DD") : input.date)}`,
      lines: input.recent.length
        ? input.recent.slice(0, 3).map(label)
        : ["No completed events in your calendar this week."],
    },
    {
      heading: `Next week, ${dateRange(
        input.upcomingStartDate,
        dayjs(input.upcomingStartDate).add(6, "day").format("YYYY-MM-DD"),
      )}`,
      lines: input.upcoming.length
        ? input.upcoming.slice(0, 3).map(label)
        : ["No upcoming highlights in your calendar."],
    },
  ];
  if (input.memories.length)
    sections.push({
      heading: "This time in your life",
      lines: input.memories.map(
        (event) => `${calendarDate(event).year()}: ${event.title}`,
      ),
    });
  if (!input.historyComplete)
    sections.push({
      heading: "Your history is still being prepared",
      lines: ["This review uses the calendar history available so far."],
    });
  if (input.completedWeeks !== null)
    sections.push({
      heading: "Your life in weeks",
      lines: [
        reflectionLifeProgress(input.completedWeeks),
        "Life view attached.",
      ],
    });
  const quote =
    REFLECTION_EMAIL_QUOTES[
      Number.parseInt(digest(input.date).slice(0, 4), 16) %
        REFLECTION_EMAIL_QUOTES.length
    ] ?? "";
  const text = `${sections.map((section) => `${section.heading}\n${section.lines.join("\n")}`).join("\n\n")}\n\nPlan next week\n${input.appUrl}\n\nUnsubscribe: ${input.unsubscribeUrl}\n\n${quote}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${sections.map((section) => `<p><strong>${escapeHtml(section.heading)}</strong><br>${section.lines.map(escapeHtml).join("<br>")}</p>`).join("")}<p>Plan next week<br><a href="${escapeHtml(input.appUrl)}">${escapeHtml(input.appUrl)}</a></p><p><a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe</a></p><p>${escapeHtml(quote)}</p></body></html>`;
  return { subject, html, text };
}
