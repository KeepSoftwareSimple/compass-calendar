import { useState } from "react";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { ReflectionPreferencesControl } from "@web/components/Settings/ReflectionPreferencesControl";
import { getNotificationPort } from "@web/notifications/notification.port";
import {
  notificationActions,
  useNotificationsEffectivelyOn,
} from "@web/notifications/notification.state";

export function NotificationsSection() {
  const enabled = useNotificationsEffectivelyOn();
  const [saving, setSaving] = useState(false);
  const port = getNotificationPort();
  const change = async (checked: boolean) => {
    setSaving(true);
    try {
      if (checked) await notificationActions.enable("settings");
      else notificationActions.disable("settings");
    } catch {
      showErrorToast("Event reminders could not be updated. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section aria-label="Notifications" className="flex flex-col gap-6 text-sm">
      <h2 className="font-medium text-text">Notifications</h2>
      <section aria-label="Event reminders" className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-text">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving || !port.isSupported()}
            onChange={(event) => void change(event.target.checked)}
            aria-describedby="event-reminders-description"
            className="accent-accent focus-visible:outline-2 focus-visible:outline-accent"
          />
          Event reminders on this device
        </label>
        <p id="event-reminders-description" className="text-text-muted">
          {port.isSupported()
            ? "A heads-up before events while Compass is open on this device."
            : "Event reminders are not supported on this device."}
        </p>
      </section>
      <ReflectionPreferencesControl />
    </section>
  );
}
