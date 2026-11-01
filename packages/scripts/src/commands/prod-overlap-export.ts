import { SyncCalendarListResponseSchema } from "@core/types/sync/connection.contracts";
import {
  EventInstanceListResponseSchema,
  type SyncEventInstance,
} from "@core/types/sync/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  INTERNAL_AUTH_HEADERS,
  signInternalRequest,
} from "@sync/auth/internal-auth";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CALENDARS_PATH = "/internal/calendars";
const EVENTS_FULL_PATH = "/internal/events/full";

export type ProdOverlapExportOptions = {
  serviceUrl: string;
  authToken: string;
  principalId: string;
  day: string;
  timeZone: string;
  outPath: string;
};

export type ScrubbedOverlapInstance = {
  eventId: string;
  calendarId: string;
  label: string;
  schedule: SyncEventInstance["schedule"];
  recurrence: SyncEventInstance["recurrence"];
  color?: string;
  colorHex?: string | null;
};

const IDENTIFYING_LABEL = (instance: SyncEventInstance): string => {
  const title = instance.content.title.toLowerCase();
  if (title.includes("4e2d")) return "Update 4e2d";
  if (title.includes("unwind")) return "Unwind";
  if (title.includes("ritual")) return "Monthly Ritual";
  if (title.includes("fall festival"))
    return "H: Fall Festival | Venture Church";
  if (title.includes("record compass demo")) return "Record Compass demo";
  const suffix = instance.eventId.slice(-6);
  return `event-${suffix}`;
};

export const scrubOverlapInstance = (
  instance: SyncEventInstance,
): ScrubbedOverlapInstance => ({
  eventId: instance.eventId,
  calendarId: instance.calendarId,
  label: IDENTIFYING_LABEL(instance),
  schedule: instance.schedule,
  recurrence: instance.recurrence,
  ...(instance.content.color !== undefined
    ? { color: instance.content.color }
    : {}),
  ...(instance.content.colorHex !== undefined
    ? { colorHex: instance.content.colorHex }
    : {}),
});

export const instanceOnLocalDay = (
  instance: SyncEventInstance,
  day: string,
  timeZone: string,
): boolean => {
  if (instance.schedule.kind !== "timed") return false;
  const start = dayjs(instance.schedule.start).tz(timeZone);
  const end = dayjs(instance.schedule.end).tz(timeZone);
  const dayStart = dayjs.tz(day, timeZone).startOf("day");
  const dayEnd = dayStart.add(1, "day");
  return start.isBefore(dayEnd) && end.isAfter(dayStart);
};

const signedHeaders = (
  authToken: string,
  principalId: string,
): Record<string, string> => {
  const timestamp = Date.now();
  return {
    "content-type": "application/json",
    [INTERNAL_AUTH_HEADERS.tenant]: principalId,
    [INTERNAL_AUTH_HEADERS.principal]: principalId,
    [INTERNAL_AUTH_HEADERS.timestamp]: String(timestamp),
    [INTERNAL_AUTH_HEADERS.signature]: signInternalRequest(authToken, {
      timestamp,
      tenantId: principalId,
      principalId,
    }),
  };
};

async function fetchInternalJson<T>(
  baseUrl: string,
  path: string,
  authToken: string,
  principalId: string,
  schema: { parse: (value: unknown) => T },
  query?: URLSearchParams,
): Promise<T> {
  const url = new URL(path, baseUrl.replace(/\/$/, ""));
  if (query) url.search = query.toString();
  const response = await fetch(url, {
    headers: signedHeaders(authToken, principalId),
  });
  if (!response.ok) {
    throw new Error(`sync ${path} failed with ${response.status}`);
  }
  return schema.parse(await response.json());
}

export async function exportProdOverlapDay(
  options: ProdOverlapExportOptions,
): Promise<{ count: number; outPath: string }> {
  const principalId = options.principalId.trim();
  if (!/^[0-9a-f]{24}$/i.test(principalId)) {
    throw new Error("principal id must be a 24-char hex ObjectId");
  }

  const calendars = await fetchInternalJson(
    options.serviceUrl,
    CALENDARS_PATH,
    options.authToken,
    principalId,
    SyncCalendarListResponseSchema,
  );
  const calendarIds = calendars.calendars.map((calendar) => calendar.id);
  if (calendarIds.length === 0) {
    throw new Error("no calendars returned for principal");
  }

  const rangeStart = dayjs
    .tz(options.day, options.timeZone)
    .subtract(1, "day")
    .startOf("day");
  const rangeEnd = dayjs
    .tz(options.day, options.timeZone)
    .add(2, "day")
    .startOf("day");

  const instances: SyncEventInstance[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams();
    for (const calendarId of calendarIds) {
      params.append("calendarIds", calendarId);
    }
    params.set("start", rangeStart.toISOString());
    params.set("end", rangeEnd.toISOString());
    params.set("limit", "500");
    if (cursor) params.set("cursor", cursor);

    const page = await fetchInternalJson(
      options.serviceUrl,
      EVENTS_FULL_PATH,
      options.authToken,
      principalId,
      EventInstanceListResponseSchema,
      params,
    );
    instances.push(...page.instances);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  const scrubbed = instances
    .filter((instance) =>
      instanceOnLocalDay(instance, options.day, options.timeZone),
    )
    .filter((instance) => instance.recurrence.kind !== "series")
    .map(scrubOverlapInstance)
    .sort((a, b) => a.label.localeCompare(b.label));

  const payload = {
    day: options.day,
    timeZone: options.timeZone,
    instanceCount: scrubbed.length,
    instances: scrubbed,
  };

  const outPath = resolve(options.outPath);
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { count: scrubbed.length, outPath };
}

export const PROD_OVERLAP_EXPORT_USAGE = `Usage: bun run cli prod-overlap-export --out <path>

Read-only export of one local calendar day from production Sync via GET /internal/events/full.
Requires SYNC_SERVICE_URL, SYNC_INTERNAL_AUTH_TOKEN, and PROD_OVERLAP_PRINCIPAL_ID in the environment.

Options:
  --out <path>           Output JSON path (required)
  --day <YYYY-MM-DD>     Local day (default: 2026-10-31)
  --time-zone <iana>     IANA zone (default: America/Denver)
  -h, --help             Show this help
`;

export function parseProdOverlapExportArgs(argv: string[]): {
  help: boolean;
  outPath: string | null;
  day: string;
  timeZone: string;
} {
  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      help: true,
      outPath: null,
      day: "2026-10-31",
      timeZone: "America/Denver",
    };
  }
  const outIndex = argv.indexOf("--out");
  const outPath = outIndex >= 0 ? argv[outIndex + 1]?.trim() || null : null;
  const dayIndex = argv.indexOf("--day");
  const day =
    dayIndex >= 0 && argv[dayIndex + 1]
      ? argv[dayIndex + 1]!.trim()
      : "2026-10-31";
  const tzIndex = argv.indexOf("--time-zone");
  const timeZone =
    tzIndex >= 0 && argv[tzIndex + 1]
      ? argv[tzIndex + 1]!.trim()
      : "America/Denver";
  return { help: false, outPath, day, timeZone };
}

export async function runProdOverlapExportCommand(
  argv: string[],
): Promise<void> {
  const parsed = parseProdOverlapExportArgs(argv);
  if (parsed.help) {
    process.stdout.write(PROD_OVERLAP_EXPORT_USAGE);
    return;
  }
  if (!parsed.outPath) {
    throw new Error("prod-overlap-export requires --out <path>");
  }

  const serviceUrl = process.env["SYNC_SERVICE_URL"]?.trim();
  const authToken = process.env["SYNC_INTERNAL_AUTH_TOKEN"]?.trim();
  const principalId = process.env["PROD_OVERLAP_PRINCIPAL_ID"]?.trim();
  if (!serviceUrl || !authToken || !principalId) {
    throw new Error(
      "prod-overlap-export requires SYNC_SERVICE_URL, SYNC_INTERNAL_AUTH_TOKEN, and PROD_OVERLAP_PRINCIPAL_ID",
    );
  }

  const result = await exportProdOverlapDay({
    serviceUrl,
    authToken,
    principalId,
    day: parsed.day,
    timeZone: parsed.timeZone,
    outPath: parsed.outPath,
  });
  process.stdout.write(
    `exported ${result.count} scrubbed instances to ${result.outPath}\n`,
  );
}
