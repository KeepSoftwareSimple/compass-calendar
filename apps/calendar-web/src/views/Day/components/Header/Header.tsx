import { type FC } from "react";
import { CalendarHeader } from "@web/components/CalendarHeader/CalendarHeader";
import { useDateInView } from "@web/views/Day/hooks/navigation/useDateInView";
import { useDateNavigation } from "@web/views/Day/hooks/navigation/useDateNavigation";

const DAY_LABEL_FORMAT = "dddd, MMMM D";

export const Header: FC = () => {
  const dateInView = useDateInView();
  const { navigateToPreviousDay, navigateToNextDay, navigateToToday } =
    useDateNavigation();

  const label = dateInView.locale("en").format(DAY_LABEL_FORMAT);

  return (
    <CalendarHeader
      label={label}
      onPrev={navigateToPreviousDay}
      onNext={navigateToNextDay}
      onToday={navigateToToday}
      prevLabel="Previous day"
      nextLabel="Next day"
    />
  );
};
