import { z } from "zod/v4";

/** Must stay in sync with MARKETING_VERSION in apps/calendar-macos/project.yml. */
export const DESKTOP_BRIDGE_VERSION = "0.1.0";

export const DesktopBridgePlatformSchema = z.enum(["macos"]);
export type DesktopBridgePlatform = z.infer<typeof DesktopBridgePlatformSchema>;

export const DesktopAgendaItemSchema = z.object({
  title: z.string().trim().min(1).max(256),
  /** ISO-8601 instant for the event start. */
  startsAt: z.string().trim().min(1).max(64),
});
export type DesktopAgendaItem = z.infer<typeof DesktopAgendaItemSchema>;

export const DesktopAgendaSchema = z
  .array(DesktopAgendaItemSchema)
  .max(20)
  .readonly();
export type DesktopAgenda = z.infer<typeof DesktopAgendaSchema>;

export const DesktopBridgeOpenExternalMessageSchema = z.strictObject({
  method: z.literal("openExternal"),
  url: z.string().url(),
});

export const DesktopBridgeSetAgendaMessageSchema = z.strictObject({
  method: z.literal("setAgenda"),
  items: DesktopAgendaSchema,
});

export const DesktopBridgeRestartToUpdateMessageSchema = z.strictObject({
  method: z.literal("restartToUpdate"),
});

export const DesktopBridgeRequestNotificationPermissionMessageSchema =
  z.strictObject({
    method: z.literal("requestNotificationPermission"),
  });

export const DesktopBridgeGetNotificationPermissionMessageSchema =
  z.strictObject({
    method: z.literal("getNotificationPermission"),
  });

export const DesktopBridgeShowNotificationMessageSchema = z.strictObject({
  method: z.literal("showNotification"),
  title: z.string().trim().min(1).max(256),
  body: z.string().trim().max(512).optional(),
  tag: z.string().trim().max(128).optional(),
  eventId: z.string().trim().min(1).max(128),
});

export const DesktopBridgeOutboundMessageSchema = z.discriminatedUnion(
  "method",
  [
    DesktopBridgeOpenExternalMessageSchema,
    DesktopBridgeSetAgendaMessageSchema,
    DesktopBridgeRestartToUpdateMessageSchema,
    DesktopBridgeRequestNotificationPermissionMessageSchema,
    DesktopBridgeGetNotificationPermissionMessageSchema,
    DesktopBridgeShowNotificationMessageSchema,
  ],
);
export type DesktopBridgeOutboundMessage = z.infer<
  typeof DesktopBridgeOutboundMessageSchema
>;
