import { type Db, ObjectId } from "mongodb";
import { z } from "zod/v4";
import { DateTimeSchema } from "@core/types/domain-primitives";
import {
  ConnectionStateReasonSchema,
  ConnectionStateSchema,
} from "@core/types/sync/connection.contracts";
import { ProviderKindSchema } from "@core/types/sync/identity.contracts";
import { Collections } from "@backend/common/constants/collections";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";

const STALE_IMPORTING_MS = 60 * 60 * 1000;
const ACTIVITY_WINDOW_30_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_90_MS = 90 * 24 * 60 * 60 * 1000;

const GroupIdSchema = z.object({
  provider: ProviderKindSchema,
  state: ConnectionStateSchema,
  stateReason: ConnectionStateReasonSchema.nullable(),
});

export const ConnectionReportRowSchema = z.object({
  provider: ProviderKindSchema,
  state: ConnectionStateSchema,
  stateReason: ConnectionStateReasonSchema.nullable(),
  count: z.number().int().nonnegative(),
  oldestUpdatedAt: DateTimeSchema,
  newestUpdatedAt: DateTimeSchema,
  activeLast30Days: z.number().int().nonnegative().nullable(),
  activeLast90Days: z.number().int().nonnegative().nullable(),
});
export type ConnectionReportRow = z.infer<typeof ConnectionReportRowSchema>;

export const StaleImportingRowSchema = z.object({
  id: z.string().min(1),
  provider: ProviderKindSchema,
  updatedAt: DateTimeSchema,
});
export type StaleImportingRow = z.infer<typeof StaleImportingRowSchema>;

export const ConnectionReportSchema = z.object({
  generatedAt: DateTimeSchema,
  activityAvailable: z.boolean(),
  rows: z.array(ConnectionReportRowSchema),
  staleImporting: z.array(StaleImportingRowSchema),
});
export type ConnectionReport = z.infer<typeof ConnectionReportSchema>;

type GroupAgg = {
  _id: {
    provider: unknown;
    state: unknown;
    stateReason: unknown;
  };
  count: number;
  oldestUpdatedAt: Date;
  newestUpdatedAt: Date;
  principalIds: unknown[];
};

type ImportingDoc = {
  _id: unknown;
  provider: unknown;
  updatedAt: unknown;
};

export async function buildConnectionReport(input: {
  syncDb: Db;
  usersDb: Db | null;
  now?: Date;
}): Promise<ConnectionReport> {
  const now = input.now ?? new Date();
  const activityAvailable = input.usersDb !== null;

  const grouped = await input.syncDb
    .collection(SYNC_COLLECTIONS.providerConnections)
    .aggregate<GroupAgg>([
      {
        $group: {
          _id: {
            provider: "$provider",
            state: "$state",
            stateReason: "$stateReason",
          },
          count: { $sum: 1 },
          oldestUpdatedAt: { $min: "$updatedAt" },
          newestUpdatedAt: { $max: "$updatedAt" },
          principalIds: { $push: "$principalId" },
        },
      },
    ])
    .toArray();

  const principalIds = uniquePrincipalIds(grouped);
  const lastSeenByPrincipal = input.usersDb
    ? await loadLastSeenByPrincipal(input.usersDb, principalIds)
    : null;

  const rows = grouped
    .map((group) =>
      toReportRow(group, now, lastSeenByPrincipal, activityAvailable),
    )
    .filter((row): row is ConnectionReportRow => row !== null)
    .sort(compareRows);

  const staleCutoff = new Date(now.getTime() - STALE_IMPORTING_MS);
  const importingDocs = await input.syncDb
    .collection<ImportingDoc>(SYNC_COLLECTIONS.providerConnections)
    .find(
      { state: "importing", updatedAt: { $lt: staleCutoff } },
      { projection: { _id: 1, provider: 1, updatedAt: 1 } },
    )
    .toArray();

  const staleImporting = importingDocs
    .map(toStaleImportingRow)
    .filter((row): row is StaleImportingRow => row !== null)
    .sort(
      (a, b) =>
        a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
    );

  return ConnectionReportSchema.parse({
    generatedAt: now.toISOString(),
    activityAvailable,
    rows,
    staleImporting,
  });
}

function uniquePrincipalIds(groups: readonly GroupAgg[]): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const value of group.principalIds) {
      if (typeof value === "string" && value.length > 0) ids.add(value);
    }
  }
  return [...ids];
}

async function loadLastSeenByPrincipal(
  usersDb: Db,
  principalIds: readonly string[],
): Promise<Map<string, Date | undefined>> {
  const objectIds = principalIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  const lastSeen = new Map<string, Date | undefined>();
  if (objectIds.length === 0) return lastSeen;

  const users = usersDb
    .collection<{ lastSeenAt?: Date }>(Collections.USER)
    .find({ _id: { $in: objectIds } }, { projection: { lastSeenAt: 1 } });
  for await (const user of users) {
    lastSeen.set(
      String(user._id),
      user.lastSeenAt instanceof Date ? user.lastSeenAt : undefined,
    );
  }
  return lastSeen;
}

function toReportRow(
  group: GroupAgg,
  now: Date,
  lastSeenByPrincipal: Map<string, Date | undefined> | null,
  activityAvailable: boolean,
): ConnectionReportRow | null {
  const parsedId = GroupIdSchema.safeParse({
    provider: group._id.provider,
    state: group._id.state,
    stateReason: group._id.stateReason ?? null,
  });
  if (!parsedId.success) return null;
  if (!(group.oldestUpdatedAt instanceof Date)) return null;
  if (!(group.newestUpdatedAt instanceof Date)) return null;

  let activeLast30Days: number | null = null;
  let activeLast90Days: number | null = null;
  if (activityAvailable && lastSeenByPrincipal) {
    const window30 = now.getTime() - ACTIVITY_WINDOW_30_MS;
    const window90 = now.getTime() - ACTIVITY_WINDOW_90_MS;
    activeLast30Days = 0;
    activeLast90Days = 0;
    for (const value of group.principalIds) {
      if (typeof value !== "string") continue;
      const seen = lastSeenByPrincipal.get(value);
      if (!(seen instanceof Date)) continue;
      const at = seen.getTime();
      if (at >= window90) activeLast90Days += 1;
      if (at >= window30) activeLast30Days += 1;
    }
  }

  return {
    provider: parsedId.data.provider,
    state: parsedId.data.state,
    stateReason: parsedId.data.stateReason,
    count: group.count,
    oldestUpdatedAt: DateTimeSchema.parse(group.oldestUpdatedAt.toISOString()),
    newestUpdatedAt: DateTimeSchema.parse(group.newestUpdatedAt.toISOString()),
    activeLast30Days,
    activeLast90Days,
  };
}

function toStaleImportingRow(doc: ImportingDoc): StaleImportingRow | null {
  const provider = ProviderKindSchema.safeParse(doc.provider);
  if (!provider.success) return null;
  if (!(doc.updatedAt instanceof Date)) return null;
  const id = String(doc._id);
  if (id.length === 0) return null;
  return {
    id,
    provider: provider.data,
    updatedAt: DateTimeSchema.parse(doc.updatedAt.toISOString()),
  };
}

function compareRows(a: ConnectionReportRow, b: ConnectionReportRow): number {
  return (
    a.provider.localeCompare(b.provider) ||
    a.state.localeCompare(b.state) ||
    (a.stateReason ?? "").localeCompare(b.stateReason ?? "")
  );
}

export function formatConnectionReport(
  report: ConnectionReport,
  json: boolean,
): string {
  if (json) {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines: string[] = [];
  lines.push("Connections by provider, state, and reason");
  if (!report.activityAvailable) {
    lines.push("activity unavailable");
  }
  lines.push("");
  lines.push(
    [
      pad("provider", 12),
      pad("state", 16),
      pad("stateReason", 24),
      pad("count", 8),
      pad("oldestUpdatedAt", 25),
      pad("newestUpdatedAt", 25),
      pad("active30d", 11),
      "active90d",
    ].join(""),
  );

  if (report.rows.length === 0) {
    lines.push("(none)");
  } else {
    for (const row of report.rows) {
      lines.push(
        [
          pad(row.provider, 12),
          pad(row.state, 16),
          pad(row.stateReason ?? "-", 24),
          pad(String(row.count), 8),
          pad(row.oldestUpdatedAt, 25),
          pad(row.newestUpdatedAt, 25),
          pad(formatActivityCount(row.activeLast30Days), 11),
          formatActivityCount(row.activeLast90Days),
        ].join(""),
      );
    }
  }

  lines.push("");
  lines.push("Importing older than one hour");
  if (report.staleImporting.length === 0) {
    lines.push("(none)");
  } else {
    lines.push([pad("id", 26), pad("provider", 12), "updatedAt"].join(""));
    for (const row of report.staleImporting) {
      lines.push(
        [pad(row.id, 26), pad(row.provider, 12), row.updatedAt].join(""),
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function formatActivityCount(value: number | null): string {
  return value === null ? "-" : String(value);
}

function pad(value: string, width: number): string {
  return value.length >= width ? `${value} ` : value.padEnd(width);
}
