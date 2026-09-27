import { CalendarIcon } from "@phosphor-icons/react/dist/csr/Calendar";
import { useSession } from "@web/auth/compass/session/useSession";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { settingsActions } from "@web/settings/settings.store";

/** Opens Settings on Booking when the feature is on for this install. */
export const useShowBookingCmdItems = (
  bookingEnabled = IS_BOOKING_ENABLED,
): CommandItem[] => {
  const { authenticated } = useSession();

  if (!authenticated || !bookingEnabled) {
    return [];
  }

  return [
    {
      id: "show-booking",
      label: "Meeting settings",
      icon: CalendarIcon,
      keywords: [
        "booking",
        "availability",
        "schedule",
        "meeting link",
        "settings",
      ],
      onClick: () =>
        settingsActions.openSettings("booking", { fromPalette: true }),
    },
  ];
};
