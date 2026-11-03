import { z } from "zod/v4";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { SyncEventCalendarIdSchema } from "@core/types/sync/event.contracts";

export const ReflectionWindowSchema = z
  .strictObject({
    key: z.string().min(1).max(64),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .refine(
    (value) =>
      Date.parse(value.end) > Date.parse(value.start) &&
      Date.parse(value.end) - Date.parse(value.start) <= 40 * 86_400_000 &&
      value.endDate > value.startDate &&
      Date.parse(value.endDate) - Date.parse(value.startDate) <=
        41 * 86_400_000,
  );
export type ReflectionWindow = z.infer<typeof ReflectionWindowSchema>;

export const ReflectionReadRequestSchema = z.strictObject({
  calendarIds: z.array(SyncEventCalendarIdSchema).max(200),
  selfEmails: z.array(z.string().max(320)).max(32),
  windows: z.array(ReflectionWindowSchema).max(8),
  cursor: z.string().min(1).max(256).optional(),
});
export type ReflectionReadRequest = z.infer<typeof ReflectionReadRequestSchema>;

export const ReflectionEventSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  seriesId: z.string().nullable(),
  calendarId: z.string(),
  title: z.string(),
  schedule: EventScheduleSchema,
  recurring: z.boolean(),
  uid: z.string().nullable(),
  windowKey: z.string(),
});
export type ReflectionEvent = z.infer<typeof ReflectionEventSchema>;

export const ReflectionReadResponseSchema = z.object({
  events: z.array(ReflectionEventSchema),
  nextCursor: z.string().nullable(),
  oldestYear: z.number().int().nullable(),
  historyComplete: z.boolean(),
  truncated: z.boolean(),
});
export type ReflectionReadResponse = z.infer<
  typeof ReflectionReadResponseSchema
>;

export const ReflectionImportRequestSchema = ReflectionReadRequestSchema.pick({
  calendarIds: true,
});
export const ReflectionImportResponseSchema = z.object({
  queued: z.number().int().nonnegative(),
  unsupportedCalendars: z.array(z.string()),
});
