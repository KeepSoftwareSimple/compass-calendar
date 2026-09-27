import { useEffect, useState } from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";

const TICK_INTERVAL_MS = 60_000;

/** Milliseconds until the next clock minute. A tick that lands exactly on a
 * minute boundary waits a full minute, so we never double-fire at :00. */
export function msUntilNextMinute(nowMs: number = Date.now()): number {
  const remainder = nowMs % TICK_INTERVAL_MS;
  return remainder === 0 ? TICK_INTERVAL_MS : TICK_INTERVAL_MS - remainder;
}

/** Re-renders at the next clock minute, then every minute after that.
 * Also catches up when the tab returns to the foreground: background
 * timers freeze, and a stale `now` would miss the upcoming-event window. */
export function useMinuteTick(): Dayjs {
  const [now, setNow] = useState<Dayjs>(() => dayjs());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      setNow(dayjs());
      timeoutId = setTimeout(tick, msUntilNextMinute());
    };

    const catchUp = () => {
      if (cancelled) return;
      clearTimeout(timeoutId);
      tick();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") catchUp();
    };

    timeoutId = setTimeout(tick, msUntilNextMinute());
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", catchUp);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", catchUp);
    };
  }, []);

  return now;
}
