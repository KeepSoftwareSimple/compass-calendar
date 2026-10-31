import { type APIRequestContext, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type ProdOverlapInstance = {
  label: string;
  schedule: {
    kind: "timed";
    start: string;
    end: string;
    timeZone: string;
  };
  recurrence: { kind: string; recurrenceId?: string; seriesId?: string };
  color?: string;
};

type CalendarsResponse = {
  calendars: Array<{
    id: string;
    capabilities?: { canWrite?: boolean };
    isPrimary?: boolean;
  }>;
};

const fixturePath = join(
  process.cwd(),
  "apps/calendar-web/src/grid/layout/fixtures/tyler-prod-overlap-2026-10-31.json",
);

const loadOverlapInstances = (): ProdOverlapInstance[] => {
  const payload = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    instances: Array<
      ProdOverlapInstance & { eventId: string; calendarId: string }
    >;
  };
  return payload.instances;
};

const newEventId = (): string => randomBytes(12).toString("hex");

const writableCalendarId = (body: CalendarsResponse): string => {
  const writable = body.calendars.find((c) => c.capabilities?.canWrite);
  const primary = body.calendars.find((c) => c.isPrimary);
  const fallback = body.calendars[0];
  const id = writable?.id ?? primary?.id ?? fallback?.id;
  if (!id) {
    throw new Error("No calendar id in /api/calendars response");
  }
  return id;
};

/** Seed scrubbed prod overlap rows onto the signed-in staging account. */
export async function seedStagingProdOverlapEvents(
  request: APIRequestContext,
  baseUrl: string,
): Promise<void> {
  const calendarsResponse = await request.get(`${baseUrl}/api/calendars`);
  expect(calendarsResponse.ok()).toBe(true);
  const calendarsBody = (await calendarsResponse.json()) as CalendarsResponse;
  const calendarId = writableCalendarId(calendarsBody);

  for (const instance of loadOverlapInstances()) {
    if (instance.schedule.kind !== "timed") continue;

    const recurrence = { kind: "single" as const };

    const createResponse = await request.post(`${baseUrl}/api/event`, {
      data: {
        id: newEventId(),
        calendarId,
        content: {
          kind: "details",
          title: instance.label,
          description: "",
          location: "",
        },
        schedule: instance.schedule,
        recurrence,
      },
    });
    if (!createResponse.ok()) {
      const body = await createResponse.text();
      throw new Error(
        `POST /api/event failed (${createResponse.status()}) for ${instance.label}: ${body}`,
      );
    }
  }
}
