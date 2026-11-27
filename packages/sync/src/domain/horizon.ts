import {
  HORIZON_FUTURE_MONTHS,
  HORIZON_PAST_MONTHS,
} from "@core/constants/sync-horizon.constants";
import dayjs from "@core/util/date/dayjs";
import { type ProjectionHorizon } from "@sync/domain/occurrence-projection";

// The rolling window Sync materializes occurrences for. Queries clamp their
// requested range to it and projection fills exactly it, so the read model is
// complete out to the horizon edge and neither side ever scans beyond it. The
// two must stay in lockstep — hence one shared definition.
export function syncHorizon(now: Date): ProjectionHorizon {
  return {
    start: dayjs(now).subtract(HORIZON_PAST_MONTHS, "month").toDate(),
    end: dayjs(now).add(HORIZON_FUTURE_MONTHS, "month").toDate(),
  };
}
