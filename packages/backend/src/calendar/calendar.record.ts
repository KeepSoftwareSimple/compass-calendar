import { z } from "zod/v4";
import { CalendarAccessSchema } from "@core/types/calendar.contracts";
import { HexColorSchema, TimeZoneSchema } from "@core/types/domain-primitives";
import { zObjectId } from "@core/types/object-id.schema";

// Accept an ObjectId or its valid 24-hex form, then normalize it to ObjectId.
const ObjectIdSchema = zObjectId;

export const LocalCalendarSourceRecordSchema = z.strictObject({
  provider: z.literal("local"),
});

export const GoogleCalendarSourceRecordSchema = z.strictObject({
  provider: z.literal("google"),
  calendarId: z.string().min(1),
  etag: z.string().min(1),
});

export const MicrosoftCalendarSourceRecordSchema = z.strictObject({
  provider: z.literal("microsoft"),
  calendarId: z.string().min(1),
  etag: z.string().min(1).optional(),
});

export const AppleCalendarSourceRecordSchema = z.strictObject({
  provider: z.literal("apple"),
  calendarId: z.string().min(1),
  etag: z.string().min(1).optional(),
});

export const CalendarSourceRecordSchema = z.discriminatedUnion("provider", [
  LocalCalendarSourceRecordSchema,
  GoogleCalendarSourceRecordSchema,
  MicrosoftCalendarSourceRecordSchema,
  AppleCalendarSourceRecordSchema,
]);
export type CalendarSourceRecord = z.infer<typeof CalendarSourceRecordSchema>;

export const CalendarRecordSchema = z
  .strictObject({
    _id: ObjectIdSchema,
    userId: ObjectIdSchema,
    name: z.string(),
    description: z.string(),
    timeZone: TimeZoneSchema.nullable(),
    foregroundColor: HexColorSchema,
    backgroundColor: HexColorSchema,
    access: CalendarAccessSchema,
    isPrimary: z.boolean(),
    isVisible: z.boolean(),
    isActive: z.boolean(),
    source: CalendarSourceRecordSchema,
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
  })
  .refine(
    ({ access, source }) => source.provider !== "local" || access === "owner",
    { message: "Local calendars must have owner access", path: ["access"] },
  );
export type CalendarRecord = z.infer<typeof CalendarRecordSchema>;
