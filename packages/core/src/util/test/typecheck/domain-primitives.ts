import { z } from "zod/v4";
import {
  ObjectIdStringSchema,
  RGBHexSchema,
  TimezoneSchema,
  zYearMonthDayString,
} from "@core/types/type.utils";

// Test typecheck shim: same runtime validation as production, without Zod
// brands so node test fixtures can use plain strings.
export const EventIdSchema = z.string().trim().min(1).max(256);
export type EventId = z.infer<typeof EventIdSchema>;

export const CalendarIdSchema = ObjectIdStringSchema;
export type CalendarId = z.infer<typeof CalendarIdSchema>;

export const DateOnlySchema = zYearMonthDayString;
export type DateOnly = z.infer<typeof DateOnlySchema>;

export const DateTimeSchema = z.iso.datetime({ offset: true });
export type DateTime = z.infer<typeof DateTimeSchema>;

export const TimeZoneSchema = TimezoneSchema;
export type TimeZone = z.infer<typeof TimeZoneSchema>;

export const HexColorSchema = RGBHexSchema;
export type HexColor = z.infer<typeof HexColorSchema>;

export const RRuleSchema = z.array(z.string().trim().min(1)).min(1).readonly();
export type RRule = z.infer<typeof RRuleSchema>;
