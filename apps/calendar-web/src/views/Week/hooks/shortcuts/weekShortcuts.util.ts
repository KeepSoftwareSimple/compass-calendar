import { draftActions, isEventFormOpen } from "@web/events/stores/draft.store";

/** Shared by the "t" shortcut and the command palette's "Go to today" row. */
export const goToTodayInWeek = ({
  scrollToNow,
  goToToday,
}: {
  scrollToNow: () => void;
  goToToday: () => void;
}) => {
  scrollToNow();
  if (isEventFormOpen()) {
    draftActions.discard();
  }
  goToToday();
};
