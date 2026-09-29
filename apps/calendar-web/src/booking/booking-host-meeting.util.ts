import { type Id } from "react-toastify";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { importOrReload } from "@web/common/utils/browser/missing-chunk-reload.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

const MEETING_WHEN_FORMAT = "ddd, MMM D, h:mm A";

export function formatHostMeetingWhen(
  slotStart: string,
  timeZone: string,
): string {
  return inEffectiveTimeZone(slotStart, timeZone).format(MEETING_WHEN_FORMAT);
}

export function dismissToastAndOpenWeekForSlot(
  toastId: Id,
  slotStart: string,
  timeZone: string,
): void {
  getToast().dismiss(toastId);
  const dateString = inEffectiveTimeZone(slotStart, timeZone).format(
    YEAR_MONTH_DAY_FORMAT,
  );
  void importOrReload(() => import("@web/routers")).then(({ router }) => {
    void router.navigate({
      to: ROOT_ROUTES.WEEK_DATE,
      params: { dateString },
    });
  });
}
