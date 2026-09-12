import { EventScheduleSchema } from "@core/types/event.contracts";
import { SyncEventContentSchema } from "@core/types/sync/event.contracts";
import { appleLiveFactory } from "@sync/providers/__contract__/apple-contract.factory";
import { googleLiveFactory } from "@sync/providers/__contract__/google-contract.factory";
import { microsoftLiveFactory } from "@sync/providers/__contract__/microsoft-contract.factory";
import { patchWithFreshVersion } from "@sync/providers/__contract__/patch-with-fresh-version";
import { type ProviderAdapters } from "@sync/providers/provider-adapters";
import { type CalendarDiscovery } from "@sync/providers/provider-calendar.port";
import {
  type ProviderEvent,
  type ProviderEventRead,
} from "@sync/providers/provider-event.port";
import {
  type ProviderEventWriter,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";
import { randomBytes } from "node:crypto";

export const SMOKE_CALENDAR_NAME = "compass-smoke";
export const SMOKE_DESCRIPTION_PREFIX = "compass-live-smoke";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class LiveSmokeError extends Error {
  constructor(
    readonly provider: string,
    readonly contractCase: string,
    message: string,
  ) {
    super(`${provider} live smoke failed (${contractCase}): ${message}`);
    this.name = "LiveSmokeError";
  }
}

export async function runMicrosoftLiveSmoke(input: {
  readonly runId: string;
  readonly refreshToken: string;
}): Promise<void> {
  const adapters = microsoftLiveFactory("");
  const refreshed = await adapters.auth.refreshAccessToken({
    refreshToken: input.refreshToken,
  });
  const accessToken = refreshed.accessToken;
  const calendarId = await findSmokeCalendar(
    adapters,
    accessToken,
    "microsoft",
  );
  process.env["LIVE_ACCESS_TOKEN"] = accessToken;
  process.env["LIVE_CALENDAR_ID"] = calendarId;

  await teardownStaleSmokeEvents(
    adapters,
    accessToken,
    calendarId,
    input.runId,
  );

  const eventId = randomBytes(12).toString("hex");
  const createdAt = new Date().toISOString();
  const description = `${SMOKE_DESCRIPTION_PREFIX} run=${input.runId} created=${createdAt}`;
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const schedule = EventScheduleSchema.parse({
    kind: "timed",
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: "UTC",
  });
  const content = SyncEventContentSchema.parse({
    title: `compass-smoke ${input.runId}`,
    description,
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  });

  let created: ProviderWriteResult;
  try {
    created = await adapters.writer.createEvent({
      accessToken,
      calendarId,
      providerEventId: eventId,
      content,
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });
  } catch (error) {
    throw new LiveSmokeError(
      "microsoft",
      "create",
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const readBack = await adapters.writer.fetchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
    });
    if (readBack?.kind !== "event") {
      throw new LiveSmokeError(
        "microsoft",
        "read-back",
        "created event was not readable",
      );
    }
    if (!readBack.content.description.includes(input.runId)) {
      throw new LiveSmokeError(
        "microsoft",
        "read-back",
        "created event did not carry the run id",
      );
    }

    // Exchange bumps an item's change key in the seconds after creation, so
    // an If-Match on the create-time etag races it (HTTP 412
    // ErrorIrresolvableConflict, seen live). Patch against the version just
    // read, and re-read it if that one was also pre-bump.
    const patched = await patchWithFreshVersion(
      adapters.writer,
      {
        accessToken,
        calendarId,
        providerEventId: created.providerEventId,
        expectedVersion: readBack.providerVersion,
        content: { ...content, title: `compass-smoke ${input.runId} updated` },
        schedule,
        recurrence: { kind: "single" },
        invitation: "none",
      },
      async () => {
        const current = await adapters.writer.fetchEvent({
          accessToken,
          calendarId,
          providerEventId: created.providerEventId,
        });
        return current?.kind === "event" ? current.providerVersion : null;
      },
    );
    if (
      !patched.providerVersion ||
      patched.providerVersion === readBack.providerVersion
    ) {
      throw new LiveSmokeError(
        "microsoft",
        "update",
        "patch did not change version",
      );
    }

    await runExceptionCase(
      adapters.writer,
      accessToken,
      calendarId,
      input.runId,
      "microsoft",
    );

    await adapters.writer.deleteEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
      expectedVersion: null,
      invitation: "none",
    });
    const gone = await adapters.writer.fetchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
    });
    if (gone !== null) {
      throw new LiveSmokeError(
        "microsoft",
        "delete",
        "event still present after delete",
      );
    }
  } finally {
    await adapters.writer
      .deleteEvent({
        accessToken,
        calendarId,
        providerEventId: created.providerEventId,
        expectedVersion: null,
        invitation: "none",
      })
      .catch(() => undefined);
  }
}

export async function runAppleLiveSmoke(input: {
  readonly runId: string;
  readonly email: string;
  readonly appPassword: string;
}): Promise<void> {
  const adapters = appleLiveFactory("");
  const refreshed = await adapters.auth.refreshAccessToken({
    refreshToken: input.appPassword,
  });
  const accessToken = refreshed.accessToken;
  const calendarId = await findSmokeCalendar(adapters, accessToken, "apple");
  process.env["LIVE_ACCESS_TOKEN"] = accessToken;
  process.env["LIVE_CALENDAR_ID"] = calendarId;

  await teardownStaleSmokeEvents(
    adapters,
    accessToken,
    calendarId,
    input.runId,
  );

  const eventId = randomBytes(12).toString("hex");
  const createdAt = new Date().toISOString();
  const description = `${SMOKE_DESCRIPTION_PREFIX} run=${input.runId} created=${createdAt}`;
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const schedule = EventScheduleSchema.parse({
    kind: "timed",
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: "UTC",
  });
  const content = SyncEventContentSchema.parse({
    title: `compass-smoke ${input.runId}`,
    description,
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  });

  let created: ProviderWriteResult;
  try {
    created = await adapters.writer.createEvent({
      accessToken,
      calendarId,
      providerEventId: eventId,
      content,
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });
  } catch (error) {
    throw new LiveSmokeError(
      "apple",
      "create",
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const readBack = await adapters.writer.fetchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
    });
    if (readBack?.kind !== "event") {
      throw new LiveSmokeError(
        "apple",
        "read-back",
        "created event was not readable",
      );
    }
    if (!readBack.content.description.includes(input.runId)) {
      throw new LiveSmokeError(
        "apple",
        "read-back",
        "created event did not carry the run id",
      );
    }

    const patched = await adapters.writer.patchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
      expectedVersion: created.providerVersion,
      content: { ...content, title: `compass-smoke ${input.runId} updated` },
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });
    if (
      !patched.providerVersion ||
      patched.providerVersion === created.providerVersion
    ) {
      throw new LiveSmokeError(
        "apple",
        "update",
        "patch did not change version",
      );
    }

    await runExceptionCase(
      adapters.writer,
      accessToken,
      calendarId,
      input.runId,
      "apple",
    );

    await adapters.writer.deleteEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
      expectedVersion: null,
      invitation: "none",
    });
    const gone = await adapters.writer.fetchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
    });
    if (gone !== null) {
      throw new LiveSmokeError(
        "apple",
        "delete",
        "event still present after delete",
      );
    }
  } finally {
    await adapters.writer
      .deleteEvent({
        accessToken,
        calendarId,
        providerEventId: created.providerEventId,
        expectedVersion: null,
        invitation: "none",
      })
      .catch(() => undefined);
  }
}

export async function runGoogleLiveSmoke(input: {
  readonly runId: string;
  readonly refreshToken: string;
}): Promise<void> {
  const adapters = googleLiveFactory("");
  const refreshed = await adapters.auth.refreshAccessToken({
    refreshToken: input.refreshToken,
  });
  const accessToken = refreshed.accessToken;
  const calendarId = await findSmokeCalendar(adapters, accessToken, "google");
  process.env["LIVE_ACCESS_TOKEN"] = accessToken;
  process.env["LIVE_CALENDAR_ID"] = calendarId;

  await teardownStaleSmokeEvents(
    adapters,
    accessToken,
    calendarId,
    input.runId,
  );

  const eventId = randomBytes(12).toString("hex");
  const createdAt = new Date().toISOString();
  const description = `${SMOKE_DESCRIPTION_PREFIX} run=${input.runId} created=${createdAt}`;
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const schedule = EventScheduleSchema.parse({
    kind: "timed",
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: "UTC",
  });
  const content = SyncEventContentSchema.parse({
    title: `compass-smoke ${input.runId}`,
    description,
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  });

  let created: ProviderWriteResult;
  try {
    created = await adapters.writer.createEvent({
      accessToken,
      calendarId,
      providerEventId: eventId,
      content,
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });
  } catch (error) {
    throw new LiveSmokeError(
      "google",
      "create",
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const readBack = await adapters.writer.fetchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
    });
    if (readBack?.kind !== "event") {
      throw new LiveSmokeError(
        "google",
        "read-back",
        "created event was not readable",
      );
    }
    if (!readBack.content.description.includes(input.runId)) {
      throw new LiveSmokeError(
        "google",
        "read-back",
        "created event did not carry the run id",
      );
    }

    const patched = await adapters.writer.patchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
      expectedVersion: created.providerVersion,
      content: { ...content, title: `compass-smoke ${input.runId} updated` },
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });
    if (
      !patched.providerVersion ||
      patched.providerVersion === created.providerVersion
    ) {
      throw new LiveSmokeError(
        "google",
        "update",
        "patch did not change version",
      );
    }

    await runExceptionCase(
      adapters.writer,
      accessToken,
      calendarId,
      input.runId,
      "google",
    );

    await adapters.writer.deleteEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
      expectedVersion: null,
      invitation: "none",
    });
    const gone = await adapters.writer.fetchEvent({
      accessToken,
      calendarId,
      providerEventId: created.providerEventId,
    });
    if (gone !== null) {
      throw new LiveSmokeError(
        "google",
        "delete",
        "event still present after delete",
      );
    }
  } finally {
    await adapters.writer
      .deleteEvent({
        accessToken,
        calendarId,
        providerEventId: created.providerEventId,
        expectedVersion: null,
        invitation: "none",
      })
      .catch(() => undefined);
  }
}

async function findSmokeCalendar(
  adapters: ProviderAdapters,
  accessToken: string,
  provider: string,
): Promise<string> {
  let discovery: CalendarDiscovery;
  try {
    discovery = await adapters.calendars.discoverCalendars({ accessToken });
  } catch (error) {
    throw new LiveSmokeError(
      provider,
      "discover",
      error instanceof Error ? error.message : String(error),
    );
  }
  const smoke = discovery.calendars.find(
    (calendar) =>
      calendar.displayName === SMOKE_CALENDAR_NAME &&
      calendar.active &&
      calendar.capabilities.canWriteEvents,
  );
  if (!smoke) {
    throw new LiveSmokeError(
      provider,
      "discover",
      `no writable calendar named ${SMOKE_CALENDAR_NAME}`,
    );
  }
  return smoke.providerCalendarId;
}

async function teardownStaleSmokeEvents(
  adapters: ProviderAdapters,
  accessToken: string,
  calendarId: string,
  runId: string,
): Promise<void> {
  const cutoff = Date.now() - ONE_DAY_MS;
  let pageToken: string | null = null;
  do {
    const page = await adapters.reader.listEventPage({
      accessToken,
      calendarId,
      pageToken,
    });
    for (const event of page.events) {
      if (event.kind !== "event") continue;
      if (!shouldTeardown(event, runId, cutoff)) continue;
      await adapters.writer
        .deleteEvent({
          accessToken,
          calendarId,
          providerEventId: event.providerEventId,
          expectedVersion: null,
          invitation: "none",
        })
        .catch(() => undefined);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
}

function shouldTeardown(
  event: ProviderEvent,
  runId: string,
  cutoff: number,
): boolean {
  const description = event.content.description;
  if (!description.startsWith(SMOKE_DESCRIPTION_PREFIX)) return false;
  if (description.includes(`run=${runId}`)) return true;
  const created = /created=([^\s]+)/.exec(description)?.[1];
  if (!created) return false;
  const stamp = Date.parse(created);
  return Number.isFinite(stamp) && stamp < cutoff;
}

async function runExceptionCase(
  writer: ProviderEventWriter,
  accessToken: string,
  calendarId: string,
  runId: string,
  provider: string,
): Promise<void> {
  const seriesId = randomBytes(12).toString("hex");
  const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const schedule = EventScheduleSchema.parse({
    kind: "timed",
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: "UTC",
  });
  const content = SyncEventContentSchema.parse({
    title: `compass-smoke series ${runId}`,
    description: `${SMOKE_DESCRIPTION_PREFIX} run=${runId} created=${start.toISOString()}`,
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  });

  const created = await writer.createEvent({
    accessToken,
    calendarId,
    providerEventId: seriesId,
    content,
    schedule,
    recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=3"] },
    invitation: "none",
  });

  try {
    const instance = await retryInstance(
      writer,
      accessToken,
      calendarId,
      created.providerEventId,
      start.toISOString(),
    );
    if (!instance || instance.kind !== "event") {
      throw new LiveSmokeError(
        provider,
        "exception",
        "fetchInstanceAt returned no occurrence",
      );
    }
    // The occurrence is read moments after the series create, so its change
    // key can be pre-bump too (see patchWithFreshVersion).
    await patchWithFreshVersion(
      writer,
      {
        accessToken,
        calendarId,
        providerEventId: instance.providerEventId,
        expectedVersion: instance.providerVersion,
        content: { ...content, title: `compass-smoke exception ${runId}` },
        schedule: instance.schedule,
        recurrence: { kind: "instance" },
        invitation: "none",
      },
      async () => {
        const current = await writer.fetchInstanceAt({
          accessToken,
          calendarId,
          seriesProviderEventId: created.providerEventId,
          originalStartAt: start.toISOString(),
          scheduleKind: "timed",
        });
        return current?.kind === "event" ? current.providerVersion : null;
      },
    );
  } finally {
    await writer
      .deleteEvent({
        accessToken,
        calendarId,
        providerEventId: created.providerEventId,
        expectedVersion: null,
        invitation: "none",
      })
      .catch(() => undefined);
  }
}

async function retryInstance(
  writer: ProviderEventWriter,
  accessToken: string,
  calendarId: string,
  seriesProviderEventId: string,
  originalStartAt: string,
): Promise<ProviderEventRead | null> {
  let last: ProviderEventRead | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    last = await writer.fetchInstanceAt({
      accessToken,
      calendarId,
      seriesProviderEventId,
      originalStartAt,
      scheduleKind: "timed",
    });
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return last;
}
