import { useEffect, useRef } from "react";
import { draftActions } from "@web/events/stores/draft.store";

/**
 * Discards the in-progress draft when the visible week window changes.
 * Skips mount so a draft seeded before this hook runs is not wiped.
 */
export const useDiscardDraftOnWeekChange = (week: number) => {
  const previousWeekRef = useRef(week);

  useEffect(() => {
    if (previousWeekRef.current === week) return;

    previousWeekRef.current = week;
    draftActions.discard();
  }, [week]);
};
