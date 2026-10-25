import {
  CalendarIdSchema,
  DateTimeSchema,
  type EventId,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type ReplaceEventInput } from "@core/types/event-command.contracts";
import { createInMemoryLocalEventStack } from "@web/events/characterization/in-memory-local-store.harness";
import { projectRecurringEdit } from "@web/events/recurrence/projectRecurringEdit";
import { describe, expect, test } from "bun:test";

const calendarId = CalendarIdSchema.parse("cccccccccccccccccccccccc");

const rangeQuery = {
  kind: "range" as const,
  start: DateTimeSchema.parse("2026-05-03T00:00:00.000Z"),
  end: DateTimeSchema.parse("2026-05-10T00:00:00.000Z"),
};

const timedSchedule = (start: string, end: string) => ({
  kind: "timed" as const,
  start: DateTimeSchema.parse(start),
  end: DateTimeSchema.parse(end),
  timeZone: TimeZoneSchema.parse("UTC"),
});

const titleOf = (event: Event) =>
  event.content.kind === "details" ? event.content.title : null;

const sortedOccurrenceTitles = (events: Event[]) =>
  events
    .filter((entry) => entry.recurrence.kind === "occurrence")
    .sort((left, right) =>
      String(left.schedule.start).localeCompare(String(right.schedule.start)),
    )
    .map(titleOf);

async function seedSeries(
  repository: ReturnType<typeof createInMemoryLocalEventStack>["repository"],
) {
  return repository.create({
    calendarId,
    content: { kind: "details", title: "Seed", description: "", location: "" },
    schedule: timedSchedule(
      "2026-05-04T09:00:00.000Z",
      "2026-05-04T10:00:00.000Z",
    ),
    recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=6"] },
  });
}

function projectionTitlesAfterEdit(
  listed: Event[],
  scope: ReplaceEventInput["scope"],
  edited: Event,
  original: Event,
) {
  const seriesEvents = listed.filter(
    (entry) => entry.recurrence.kind === "occurrence",
  );
  const seriesMaster = listed.find(
    (entry) => entry.recurrence.kind === "series",
  );
  const projection = projectRecurringEdit({
    scope,
    edited,
    original,
    seriesEvents,
    seriesMaster,
  });
  const byId = new Map<EventId, Event>(
    listed.map((entry) => [entry.id, entry]),
  );
  for (const id of projection.removeIds) byId.delete(id as EventId);
  for (const upsert of projection.upserts) byId.set(upsert.id, upsert);
  return sortedOccurrenceTitles([...byId.values()]);
}

describe("characterization: projectRecurringEdit vs local persistence", () => {
  test("scope this matches local list titles", async () => {
    const { repository } = createInMemoryLocalEventStack();
    await seedSeries(repository);
    const listed = await repository.list(rangeQuery);
    const target = listed.find(
      (entry) => entry.recurrence.kind === "occurrence",
    )!;
    const edited = {
      ...target,
      content: {
        kind: "details" as const,
        title: "One",
        description: "",
        location: "",
      },
    };

    await repository.replace(target.id, {
      content: edited.content,
      schedule: target.schedule as ReplaceEventInput["schedule"],
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    const persistedTitles = sortedOccurrenceTitles(
      await repository.list(rangeQuery),
    );
    expect(projectionTitlesAfterEdit(listed, "this", edited, target)).toEqual(
      persistedTitles,
    );
  });
});
