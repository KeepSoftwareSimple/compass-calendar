import {
  type NotificationParseResult,
  type NotificationRequest,
  type ProviderNotificationAdapter,
  ProviderNotificationError,
} from "@sync/providers/provider-notifications.port";

export class AppleNotificationAdapter implements ProviderNotificationAdapter {
  async watch(): Promise<never> {
    throw new ProviderNotificationError(
      "watchUnsupported",
      "Apple uses polling instead of push channels",
    );
  }

  async stopChannel(): Promise<void> {}

  parseNotification(_request: NotificationRequest): NotificationParseResult {
    return null;
  }
}
