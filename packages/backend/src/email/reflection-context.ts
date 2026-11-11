import { type WithId } from "mongodb";
import { getCompletedLifeWeeks } from "@core/life/life-math";
import {
  type SyncEventCalendarId,
  SyncEventCalendarIdSchema,
} from "@core/types/sync/event.contracts";
import {
  type ReflectionEvent,
  type ReflectionWindow,
} from "@core/types/sync/reflection.contracts";
import { type Schema_User } from "@core/types/user.types";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import {
  renderReflectionEmail,
  selectReflectionEvents,
} from "@backend/email/reflection-content";
import { renderReflectionLifePdf } from "@backend/email/reflection-life-image";
import {
  historicalMemoryWindow,
  reflectionExpiresAt,
  reflectionWindows,
} from "@backend/email/reflection-schedule";
import hiddenEventService from "@backend/user/services/hidden-event.service";

export async function reflectionCalendarContext(user: WithId<Schema_User>) {
  const client = getSyncServiceClient();
  const principal = toSyncPrincipal(user._id.toHexString());
  const [remote, local, connections] = await Promise.all([
    client.listCalendars(principal, { activeOnly: true }),
    mongoService.calendar.findOne({
      userId: user._id,
      "source.provider": "local",
      isActive: true,
      isVisible: true,
    }),
    client.listConnections(principal),
  ]);
  if (!remote.ok || !connections.ok)
    throw new Error("Calendar service unavailable");
  const excluded = new Set(
    user.reflectionPreferences?.excludedCalendarIds ?? [],
  );
  const calendarIds: SyncEventCalendarId[] = remote.value.calendars
    .filter(
      (calendar) =>
        calendar.accessRole !== "busyOnly" && !excluded.has(calendar.id),
    )
    .map((calendar) => calendar.id);
  if (local && !excluded.has(local._id.toHexString()))
    calendarIds.push(SyncEventCalendarIdSchema.parse(local._id.toHexString()));
  const selfEmails = [
    ...new Set([
      user.email,
      ...connections.value.connections.flatMap((connection) =>
        connection.account.email ? [connection.account.email] : [],
      ),
    ]),
  ];
  return { calendarIds, selfEmails, client, principal };
}

export async function prepareReflection(
  row: EmailSendRecord,
  user: WithId<Schema_User>,
  unsubscribeUrl: string,
  options: { preview?: boolean; allowIncompleteHistory?: boolean } = {},
) {
  const edition = row.reflection;
  if (!edition) throw new Error("Missing reflection edition");
  const context = await reflectionCalendarContext(user);
  const metadata = await context.client.readReflection(context.principal, {
    calendarIds: context.calendarIds,
    selfEmails: context.selfEmails,
    windows: [],
  });
  if (!metadata.ok) throw new Error("Calendar history unavailable");
  if (
    !edition.trial &&
    !options.allowIncompleteHistory &&
    !metadata.value.historyComplete
  )
    throw new Error("Calendar history incomplete");
  const current = reflectionWindows(
    edition.date,
    edition.timeZone,
    edition.cadence,
  );
  const historical: ReflectionWindow[] = [];
  const year = Number(edition.date.slice(0, 4));
  for (
    let pastYear = year - 1;
    pastYear >= (metadata.value.oldestYear ?? year);
    pastYear--
  ) {
    historical.push(
      historicalMemoryWindow(
        edition.date,
        edition.timeZone,
        pastYear,
        current[0]!.startDate,
      ),
    );
  }
  const windows = [...current, ...historical];
  const events: ReflectionEvent[] = [];
  let historyComplete = metadata.value.historyComplete;
  for (let offset = 0; offset < windows.length; offset += 8) {
    let cursor: string | undefined;
    do {
      if (
        !options.preview &&
        new Date() >= reflectionExpiresAt(edition.date, edition.timeZone)
      )
        throw new Error("Reflection edition expired");
      const page = await context.client.readReflection(context.principal, {
        calendarIds: context.calendarIds,
        selfEmails: context.selfEmails,
        windows: windows.slice(offset, offset + 8),
        ...(cursor ? { cursor } : {}),
      });
      if (!page.ok || page.value.truncated)
        throw new Error("Calendar history could not be read completely");
      if (page.value.nextCursor === cursor)
        throw new Error("Calendar history cursor did not advance");
      historyComplete &&= page.value.historyComplete;
      events.push(...page.value.events);
      if (events.length > 50_000)
        throw new Error("Calendar history needs a smaller preparation batch");
      cursor = page.value.nextCursor ?? undefined;
      // Keep preparation inside its existing claim lease across large histories.
      await mongoService.emailSend.updateOne(
        { _id: row._id, status: "queued" },
        { $set: { nextAttemptAt: new Date(Date.now() + 120_000) } },
      );
    } while (cursor);
  }
  if (!edition.trial && !options.allowIncompleteHistory && !historyComplete)
    throw new Error("Calendar history incomplete");
  const previous = await mongoService.emailSend
    .find(
      {
        userId: user._id,
        $or: [
          { sequence: "reflection" },
          { sequence: "welcome", stepKey: "weekly-review" },
        ],
        status: "sent",
        sentAt: { $gte: new Date(row.sendAt.getTime() - 7 * 86_400_000) },
      },
      { projection: { "reflection.memoryIds": 1 } },
    )
    .toArray();
  const selected = selectReflectionEvents({
    events,
    timeZone: edition.timeZone,
    cutoff: new Date(current[0]!.end),
    upcomingCutoff: row.sendAt,
    recentStartDate: current[0]!.startDate,
    hiddenIds: new Set(await hiddenEventService.listHiddenEventIds(user._id)),
    previousMemoryIds: new Set(
      previous.flatMap((send) => send.reflection?.memoryIds ?? []),
    ),
  });
  const birthDate = user.lifePreferences?.preferences?.birthDate;
  const completedWeeks = birthDate
    ? getCompletedLifeWeeks(birthDate, edition.date)
    : null;
  const pdfBase64 = birthDate
    ? (
        await renderReflectionLifePdf(
          birthDate,
          edition.date,
          new URL("/life", CONFIG.FRONTEND_URL).toString(),
        )
      ).toString("base64")
    : null;
  const appUrl = new URL(
    `/week/${current[1]!.startDate}`,
    CONFIG.FRONTEND_URL,
  ).toString();
  const content = renderReflectionEmail({
    ...selected,
    date: edition.date,
    timeZone: edition.timeZone,
    cadence: edition.cadence,
    recentStartDate: current[0]!.startDate,
    upcomingStartDate: current[1]!.startDate,
    completedWeeks,
    historyComplete,
    appUrl,
    unsubscribeUrl,
  });
  return {
    ...content,
    pdfBase64,
    memoryIds: selected.memories.map((event) => event.id),
    calendarIds: context.calendarIds,
    lifeRevision: user.lifePreferences?.revision ?? 0,
  };
}
