import { type FC, useCallback, useEffect, useId, useState } from "react";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { Switch } from "@web/components/Switch/Switch";
import { isDesktop } from "@web/desktop/isDesktop";

export const DesktopLaunchAtLoginSetting: FC = () => {
  const switchId = useId();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }
    const bridge = window.compassDesktop;
    if (!bridge?.getLaunchAtLogin) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    void bridge.getLaunchAtLogin().then((value) => {
      if (!cancelled) {
        setEnabled(value);
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onCheckedChange = useCallback(async (checked: boolean) => {
    const bridge = window.compassDesktop;
    if (!bridge?.setLaunchAtLogin) {
      return;
    }
    setBusy(true);
    try {
      const confirmed = await bridge.setLaunchAtLogin(checked);
      setEnabled(confirmed);
    } catch {
      showErrorToast("Could not update launch at login. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isDesktop() || !window.compassDesktop?.setLaunchAtLogin) {
    return null;
  }

  return (
    <Switch
      busy={busy}
      checked={enabled}
      id={switchId}
      label="Launch Compass at login"
      onCheckedChange={(checked) => {
        void onCheckedChange(checked);
      }}
    />
  );
};
