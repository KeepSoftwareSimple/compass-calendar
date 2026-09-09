import { useCallback, useState } from "react";
import { isSavedBookingPage } from "@core/types/booking.contracts";
import { useSession } from "@web/auth/compass/session/useSession";
import { useBookingPageQuery } from "@web/booking/booking.query";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { isMobileOS } from "@web/common/utils/device/device.util";
import {
  selectFirstEventDone,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  hasDismissedMeetingPageNudge,
  markMeetingPageNudgeDismissed,
} from "./meeting-page-nudge.util";

type MeetingPageNudgeOptions = {
  bookingEnabled?: boolean;
  isMobile?: boolean;
};

interface MeetingPageNudgeState {
  visible: boolean;
  dismiss: () => void;
}

export function useMeetingPageNudge({
  bookingEnabled = IS_BOOKING_ENABLED,
  isMobile = isMobileOS(),
}: MeetingPageNudgeOptions = {}): MeetingPageNudgeState {
  const { authenticated } = useSession();
  const firstEventDone = useFirstEventPromptStore(selectFirstEventDone);
  const [dismissed, setDismissed] = useState(hasDismissedMeetingPageNudge);

  const eligible =
    authenticated &&
    bookingEnabled &&
    !isMobile &&
    firstEventDone &&
    !dismissed;

  const { data, isSuccess } = useBookingPageQuery(eligible);
  const live = isSavedBookingPage(data) && data.enabled === true;

  const dismiss = useCallback(() => {
    markMeetingPageNudgeDismissed();
    setDismissed(true);
  }, []);

  return { visible: eligible && isSuccess && !live, dismiss };
}
