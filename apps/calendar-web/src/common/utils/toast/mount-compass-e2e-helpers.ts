import { NodeEnv } from "@core/constants/core.constants";
import {
  CalendarIdSchema,
  DateTimeSchema,
  EventIdSchema,
} from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { showAppUpdateAvailableToast } from "@web/common/utils/toast/app-update-available.toast";
import { showRecurrenceScopeToast } from "@web/common/utils/toast/recurrence-scope.toast";
import {
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";

declare global {
  interface Window {
    __compassE2E?: {
      showAppUpdateAvailableToast: typeof showAppUpdateAvailableToast;
      showRecurrenceScopeCaptureToast: () => void;
    };
  }
}

const captureCalendarId = CalendarIdSchema.parse("507f1f77bcf86cd799439011");
const captureSeriesId = EventIdSchema.parse("cccccccccccccccccccccccc");
const captureEventId = EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa");
const captureSchedule = EventScheduleSchema.parse({
  kind: "timed",
  start: "2026-05-05T09:00:00.000-05:00",
  end: "2026-05-05T10:00:00.000-05:00",
  timeZone: "America/Chicago",
});

const captureRecurrenceScopeEvent = (): Event => ({
  id: captureEventId,
  calendarId: captureCalendarId,
  content: { kind: "details", title: "Write", description: "" },
  schedule: captureSchedule,
  recurrence: {
    kind: "occurrence",
    seriesId: captureSeriesId,
  },
  createdAt: DateTimeSchema.parse("2026-05-01T00:00:00.000Z"),
  updatedAt: null,
});

function showRecurrenceScopeCaptureToast(): void {
  const original = captureRecurrenceScopeEvent();
  recurrenceScopeOpportunityActions.begin({
    kind: "replace",
    original,
    input: {
      content: {
        kind: "details",
        title: "Write",
        description: "",
        location: "",
      },
      schedule: original.schedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    },
    source: "local",
  });
  const opportunity = useRecurrenceScopeOpportunityStore.getState().opportunity;
  if (opportunity) showRecurrenceScopeToast(opportunity);
}

/** Playwright-only hooks for deterministic notice layout tests. */
export function mountCompassE2EHelpers(): void {
  if (ENV_WEB.NODE_ENV !== NodeEnv.Test) return;

  window.__compassE2E = {
    showAppUpdateAvailableToast,
    showRecurrenceScopeCaptureToast,
  };
}
