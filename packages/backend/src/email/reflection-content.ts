import { LIFE_QUOTES } from "@core/life/life-quotes";
import { type ReflectionEvent } from "@core/types/sync/reflection.contracts";
import dayjs from "@core/util/date/dayjs";
import { escapeHtml } from "@core/util/escape-html.util";
import { type ReflectionCadence } from "@backend/email/reflection-schedule";
import { createHash } from "node:crypto";

const unique = (events: ReflectionEvent[]) => [
  ...new Map(
    events.map((event) => [
      event.uid
        ? `${event.uid}:${event.schedule.kind === "timed" ? Date.parse(event.schedule.start) : event.schedule.start}`
        : event.id,
      event,
    ]),
  ).values(),
];
const rank = (event: ReflectionEvent) =>
  (event.recurring ? 0 : 10) + (event.schedule.kind === "allDay" ? 2 : 0);

export function selectReflectionEvents(input: {
  events: ReflectionEvent[];
  timeZone: string;
  cutoff: Date;
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
    .filter((event) => event.windowKey === "upcoming")
    .sort((a, b) => a.schedule.start.localeCompare(b.schedule.start));
  const history = eligible.filter(
    (event) =>
      event.windowKey.startsWith("history:") &&
      (!event.recurring || event.schedule.kind === "allDay"),
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
  const heading =
    input.cadence === "weekly" ? "Your week so far" : "Your past seven days";
  const label = (event: ReflectionEvent) => {
    const date =
      event.schedule.kind === "allDay"
        ? event.schedule.start
        : dayjs(event.schedule.start)
            .tz(input.timeZone)
            .format("YYYY-MM-DD HH:mm");
    return `${date}: ${event.title}`;
  };
  const sections: { heading: string; lines: string[] }[] = [
    {
      heading: `${heading}: ${input.recentStartDate} to ${input.date}`,
      lines: [
        `Completed calendar events through 10:30 a.m. (${input.timeZone}) on ${input.date}.`,
        ...(input.recent.length
          ? [
              `Your calendar included ${input.recent.length} events.`,
              ...input.recent.slice(0, 3).map(label),
            ]
          : ["No completed calendar events to recap in this period."]),
      ],
    },
  ];
  if (input.memories.length)
    sections.push({
      heading: "This time in your life",
      lines: input.memories.map(
        (event) =>
          `${input.weekMatch(event) ? "This week" : "Around this time"}: ${label(event)}`,
      ),
    });
  if (!input.historyComplete)
    sections.push({
      heading: "Your history is still being prepared",
      lines: [
        "This trial reflection uses the calendar history available so far.",
      ],
    });
  if (input.completedWeeks !== null)
    sections.push({
      heading: "Your life in weeks",
      lines: [
        `${input.completedWeeks.toLocaleString("en-US")} completed weeks. Open the attached image for the full view.`,
        "79-year U.S. reference (CDC, 2024), a visualization assumption rather than a personal prediction.",
      ],
    });
  const quotes = [LIFE_QUOTES[2], LIFE_QUOTES[13], LIFE_QUOTES[23]];
  sections.push({
    heading: "A little perspective",
    lines: [
      quotes[
        Number.parseInt(digest(input.date).slice(0, 4), 16) % quotes.length
      ] ?? "",
    ],
  });
  sections.push({
    heading: `Looking ahead: ${input.upcomingStartDate} to ${dayjs(
      input.upcomingStartDate,
    )
      .add(input.cadence === "weekly" ? 6 : 7, "day")
      .format("YYYY-MM-DD")}`,
    lines: input.upcoming.length
      ? input.upcoming.slice(0, 3).map(label)
      : ["No upcoming events are on these calendars yet."],
  });
  sections.push({
    heading: "What would you like to make time for?",
    lines: [
      "Make room for one thing that matters to you in Compass.",
      input.appUrl,
    ],
  });
  const subject = `Your Compass reflection: ${input.date}`;
  const text = `${sections
    .map((section) => `${section.heading}\n\n${section.lines.join("\n")}`)
    .join("\n\n")}\n\nStop weekly reflections: ${input.unsubscribeUrl}`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3eee2;color:#403a2f;font-family:Arial,sans-serif"><main style="max-width:600px;margin:auto;padding:24px"><h1>Your Compass reflection</h1>${sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.lines.map((line) => (line === input.appUrl ? `<p><a href="${escapeHtml(line)}">${escapeHtml(line)}</a></p>` : `<p>${escapeHtml(line)}</p>`)).join("")}</section>`).join("")}<p><a href="${escapeHtml(input.unsubscribeUrl)}">Stop weekly reflections</a></p></main></body></html>`;
  return { subject, html, text };
}
