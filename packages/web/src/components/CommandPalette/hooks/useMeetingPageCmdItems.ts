import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { CalendarPlusIcon } from "@phosphor-icons/react/dist/csr/CalendarPlus";
import { useSession } from "@web/auth/compass/session/useSession";
import { useBookingPageQuery } from "@web/booking/booking.query";
import { isLiveBookingPage } from "@web/booking/booking.util";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { settingsActions } from "@web/settings/settings.store";

/** Opens the public meeting page or starts setup, depending on host state. */
export function useMeetingPageCmdItems(
  paletteOpen: boolean,
  bookingEnabled = IS_BOOKING_ENABLED,
): CommandItem[] {
  const { authenticated } = useSession();
  const queryEnabled = paletteOpen && authenticated && bookingEnabled;
  const { data, isSuccess } = useBookingPageQuery(queryEnabled);

  if (!queryEnabled || !isSuccess) {
    return [];
  }

  if (isLiveBookingPage(data)) {
    const bookingUrl = data.bookingUrl;
    return [
      {
        id: "open-meeting-page",
        label: "Open meeting page",
        icon: ArrowSquareOut,
        keywords: [
          "booking",
          "meeting link",
          "public",
          "share",
          "meet",
          "schedule",
        ],
        onClick: () => {
          window.open(bookingUrl, "_blank", "noopener,noreferrer");
        },
      },
    ];
  }

  return [
    {
      id: "setup-meeting-page",
      label: "Set up meeting page",
      icon: CalendarPlusIcon,
      keywords: [
        "booking",
        "availability",
        "meeting link",
        "configure",
        "setup",
        "share",
      ],
      onClick: () =>
        settingsActions.openSettings("booking", { fromPalette: true }),
    },
  ];
}
