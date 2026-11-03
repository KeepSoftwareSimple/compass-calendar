import { z } from "zod/v4";

// Empty means unconfirmed. Never infer a birthday from a client placeholder.
export const LifePreferencesSchema = z.strictObject({
  birthDate: z.union([
    z.literal(""),
    z.iso.date().refine((value) => value >= "1900-01-01"),
  ]),
  lifespan: z.number().int().min(1).max(150),
  variation: z.enum(["average", "long", "random"]),
});
export type LifePreferences = z.infer<typeof LifePreferencesSchema>;

export const LifePreferencesResponseSchema = z.strictObject({
  preferences: LifePreferencesSchema.nullable(),
  revision: z.number().int().nonnegative(),
});
export type LifePreferencesResponse = z.infer<
  typeof LifePreferencesResponseSchema
>;

export const SaveLifePreferencesSchema = z.strictObject({
  preferences: LifePreferencesSchema,
  // null initializes only if absent; a number updates a known revision.
  expectedRevision: z.number().int().nonnegative().nullable(),
});
export type SaveLifePreferences = z.infer<typeof SaveLifePreferencesSchema>;

export const ReflectionPreferencesSchema = z.strictObject({
  enabled: z.boolean(),
  excludedCalendarIds: z.array(z.string().min(1).max(256)).max(200).default([]),
  timeZone: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone"),
});
export type ReflectionPreferences = z.infer<typeof ReflectionPreferencesSchema>;

export const ReflectionPreferencesResponseSchema = z.object({
  preferences: ReflectionPreferencesSchema.nullable(),
  available: z.boolean(),
  trial: z.boolean(),
});
export const ReflectionCalendarVisibilitySchema = z.strictObject({
  calendarId: z.string().min(1).max(256),
  isVisible: z.boolean(),
});
