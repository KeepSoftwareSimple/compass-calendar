import { z } from "zod/v4";
import {
  DesktopBridgeDismissQuickAddPanelMessageSchema,
  DesktopBridgeSetQuickAddHotkeyMessageSchema,
} from "@core/desktop/desktop-quick-add.contract";

/** Maximum events the menu bar can show. */
export const DESKTOP_AGENDA_MAX_ITEMS = 20;

export const DesktopBridgePlatformSchema = z.enum(["macos"]);
export type DesktopBridgePlatform = z.infer<typeof DesktopBridgePlatformSchema>;

export const DesktopAgendaItemSchema = z.object({
  id: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(256),
  /** ISO-8601 instant for the event start. */
  startsAt: z.string().trim().min(1).max(64),
  /** ISO-8601 instant for the event end. */
  endsAt: z.string().trim().min(1).max(64),
});
export type DesktopAgendaItem = z.infer<typeof DesktopAgendaItemSchema>;

export const DesktopAgendaSchema = z
  .array(DesktopAgendaItemSchema)
  .max(DESKTOP_AGENDA_MAX_ITEMS)
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

export const DesktopBridgeThemeNameSchema = z.enum([
  "light-beach",
  "dark-abyss",
]);
export type DesktopBridgeThemeName = z.infer<
  typeof DesktopBridgeThemeNameSchema
>;

export const DesktopBridgeSetAppearanceMessageSchema = z.strictObject({
  method: z.literal("setAppearance"),
  theme: DesktopBridgeThemeNameSchema,
});

export const DesktopBridgeSetLaunchAtLoginMessageSchema = z.strictObject({
  method: z.literal("setLaunchAtLogin"),
  enabled: z.boolean(),
});

export const DesktopBridgeGetLaunchAtLoginMessageSchema = z.strictObject({
  method: z.literal("getLaunchAtLogin"),
});

export const DesktopBridgeReportDeepLinkNavigationMessageSchema =
  z.strictObject({
    method: z.literal("reportDeepLinkNavigation"),
    path: z.string().trim().min(1).max(512),
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
    DesktopBridgeSetQuickAddHotkeyMessageSchema,
    DesktopBridgeDismissQuickAddPanelMessageSchema,
    DesktopBridgeSetAppearanceMessageSchema,
    DesktopBridgeSetLaunchAtLoginMessageSchema,
    DesktopBridgeGetLaunchAtLoginMessageSchema,
    DesktopBridgeReportDeepLinkNavigationMessageSchema,
  ],
);
export type DesktopBridgeOutboundMessage = z.infer<
  typeof DesktopBridgeOutboundMessageSchema
>;
