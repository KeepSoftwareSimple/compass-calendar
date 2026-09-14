import { useEffect, useState } from "react";
import dayjs from "@core/util/date/dayjs";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  selectFirstEventCelebrating,
  selectFirstEventDone,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import { isLifePathname } from "@web/components/RootShell/isLifePathname";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  selectJumpableDayPrefixes,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { selectShortcutHint } from "@web/shortcuts/tips/selectShortcutHint";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { useShortcutHintProgress } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import { useIsAnyCalendarEventFocused } from "@web/shortcuts/tips/useIsAnyCalendarEventFocused";

/** Re-rank this often so a tip that nothing else disturbs still gives way.
 * Impressions are only recorded when the rendered tip changes, so without a
 * tick one tip can hold the bar for a whole session and never fatigue. */
export const SHORTCUT_HINT_ROTATION_MS = 90 * 1000;

/**
 * Reads onboarding + current-doing stores and returns the sidebar's next
 * shortcut. Life vs calendar is taken from the page URL: Day/Week and Life
 * each mount their own status bar, so a pathname read is current on mount.
 */
export function useShortcutHintContext() {
  const firstEventDone = useFirstEventPromptStore(selectFirstEventDone);
  const isCelebrating = useFirstEventPromptStore(selectFirstEventCelebrating);
  const isFormOpen = useDraftStore(selectIsEventFormOpen);
  const eventFocused = useIsAnyCalendarEventFocused();
  const pathname = window.location.pathname;
  const isLifeView = isLifePathname(pathname);
  const isWeekView =
    pathname === ROOT_ROUTES.WEEK ||
    pathname.startsWith(`${ROOT_ROUTES.WEEK}/`);
  const progress = useShortcutHintProgress();
  const jumpableDayPrefixes = useEventJumpStore(selectJumpableDayPrefixes);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(() => {
      if (document.hidden) return;
      tick();
    }, SHORTCUT_HINT_ROTATION_MS);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return selectShortcutHint(
    {
      isFormOpen,
      isLifeView,
      isWeekView,
      eventFocused,
      firstEventDone: firstEventDone || isCelebrating,
      jumpableDayPrefixes,
      todayWeekday: dayjs().day(),
    },
    progress,
    readShortcutUsageProfile(),
    now,
  );
}
