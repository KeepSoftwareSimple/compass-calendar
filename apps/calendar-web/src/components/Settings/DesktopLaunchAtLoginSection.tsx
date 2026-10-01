import { type FC, useCallback, useEffect, useState } from "react";
import { isDesktop } from "@web/desktop/isDesktop";

export const DesktopLaunchAtLoginSection: FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    void window.compassDesktop?.getLaunchAtLogin?.().then((value) => {
      if (!cancelled) {
        setEnabled(value);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    window.compassDesktop?.setLaunchAtLogin?.(next);
  }, [enabled]);

  if (!isDesktop()) return null;

  return (
    <section className="flex flex-col gap-2 border-border border-t pt-4">
      <h3 className="font-medium text-sm text-text">Launch at login</h3>
      <p className="text-text-muted text-xs">
        Open Compass automatically when you sign in to this Mac.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={enabled}
          className="size-4 rounded-sm border border-border-strong accent-accent"
          disabled={loading}
          onChange={onToggle}
          type="checkbox"
        />
        <span>Launch Compass at login</span>
      </label>
    </section>
  );
};
