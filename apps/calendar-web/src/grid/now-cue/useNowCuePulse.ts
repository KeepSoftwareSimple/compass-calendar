import { useEffect, useRef, useState } from "react";
import {
  NOW_CUE_PULSE_MS,
  useNowCueStore,
} from "@web/grid/now-cue/now-cue.store";

/** True for {@link NOW_CUE_PULSE_MS} after the now-cue store pulses. */
export function useNowCuePulse(): boolean {
  const pulse = useNowCueStore((state) => state.pulse);
  const [active, setActive] = useState(false);
  const lastPulseRef = useRef(pulse);

  useEffect(() => {
    if (pulse === lastPulseRef.current) return;
    lastPulseRef.current = pulse;
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), NOW_CUE_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  return active;
}
