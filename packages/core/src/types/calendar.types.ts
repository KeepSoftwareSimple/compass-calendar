import { z } from "zod/v4";
import { zObjectId } from "@core/types/object-id.schema";
import { RGBHexSchema, TimezoneSchema } from "@core/types/type.utils";

// NOTE: distinct from calendar.contracts.ts's `CalendarProvider` type
// (z.enum(["local", "google"])) — this is the legacy value set, retained
// until the legacy calendar model is retired.
export enum CalendarProvider {
  GOOGLE = "google",
  COMPASS = "compass",
}

export const GoogleCalendarMetadataSchema = z.object({
  id: z.string(),
  provider: z.literal(CalendarProvider.GOOGLE).default(CalendarProvider.GOOGLE),
  etag: z.string(),
  summary: z.string(),
  summaryOverride: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  accessRole: z.enum(["freeBusyReader", "reader", "writer", "owner"]),
  primary: z.boolean().default(false).optional(),
  conferenceProperties: z.object({
    allowedConferenceSolutionTypes: z.array(
      z.enum(["hangoutsMeet", "eventHangout", "eventNamedHangout"]),
    ),
  }),
  defaultReminders: z.array(
    z.object({
      method: z.enum(["email", "popup"]),
      minutes: z.number().int().min(0).max(40320), // gcal 4 weeks max
    }),
  ),
  notificationSettings: z
    .object({
      notifications: z.array(
        z.object({
          type: z.enum([
            "eventCreation",
            "eventChange",
            "eventCancellation",
            "eventResponse",
            "agenda",
          ]),
          method: z.enum(["email"]),
        }),
      ),
    })
    .optional(),
});

export const CompassCalendarSchema = z.object({
  _id: zObjectId,
  user: zObjectId,
  backgroundColor: RGBHexSchema,
  color: RGBHexSchema,
  selected: z.boolean().default(true),
  primary: z.boolean().default(false),
  timezone: TimezoneSchema.nullable().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().nullable().optional(),
  metadata: GoogleCalendarMetadataSchema, // use union when other providers present
});

export type Schema_Calendar = z.infer<typeof CompassCalendarSchema>;
