import { createElement } from "react";
import { isSyntheticAccountEmail } from "@core/analytics/synthetic-account.util";
import { NodeEnv } from "@core/constants/core.constants";
import { BookingReservationIdSchema } from "@core/types/booking.contracts";
import {
  CalendarIdSchema,
  DateTimeSchema,
  EventIdSchema,
} from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import { SHORTCUT_UPGRADE_TOAST_ID } from "@web/billing/prompt-shortcut-upgrade";
import { ShortcutUpgradeToast } from "@web/billing/ShortcutUpgradeToast";
import { showGuestRsvpToast } from "@web/booking/GuestRsvpToast";
import { showNewMeetingsToast } from "@web/booking/NewMeetingsToast";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { showAppUpdateAvailableToast } from "@web/common/utils/toast/app-update-available.toast";
import { showConferenceLinkAddedToast } from "@web/common/utils/toast/conference-link-added.toast";
import { showRecurrenceScopeToast } from "@web/common/utils/toast/recurrence-scope.toast";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import {
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { getShortcutHint } from "@web/shortcuts/tips/shortcut-tips.data";

declare global {
  interface Window {
    __compassE2E?: {
      showAppUpdateAvailableToast: typeof showAppUpdateAvailableToast;
      showRecurrenceScopeCaptureToast: () => void;
      showConferenceLinkAddedCaptureToast: () => void;
      showGuestRsvpCaptureToast: () => void;
      showNewMeetingsCaptureToast: () => void;
      showShortcutUpgradeCaptureToast: () => void;
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

function showConferenceLinkAddedCaptureToast(): void {
  showConferenceLinkAddedToast({
    label: "Google Meet",
    url: "https://meet.google.com/abc-defg-hij",
  });
}

function showGuestRsvpCaptureToast(): void {
  showGuestRsvpToast([
    {
      guestName: "Alex Guest",
      status: "accepted",
      slotStart: "2026-06-12T15:00:00.000Z",
    },
  ]);
}

function showNewMeetingsCaptureToast(): void {
  showNewMeetingsToast({
    count: 1,
    latest: {
      id: BookingReservationIdSchema.parse("507f1f77bcf86cd799439012"),
      guestName: "Jamie Guest",
      slotStart: DateTimeSchema.parse("2026-06-12T16:00:00.000Z"),
      slotEnd: DateTimeSchema.parse("2026-06-12T16:30:00.000Z"),
      kind: "booked",
    },
  });
}

function showShortcutUpgradeCaptureToast(): void {
  const hint = getShortcutHint("nudge");
  showStatusToast(
    SHORTCUT_UPGRADE_TOAST_ID,
    createElement(ShortcutUpgradeToast, {
      toastId: SHORTCUT_UPGRADE_TOAST_ID,
      parts: hint.parts,
      title:
        "Premium unlocks it, so you can reschedule in seconds without touching the mouse.",
      ctaLabel: "Start trial",
      checkoutSource: {
        kind: "shortcut_prompt",
        featureArea: "event_editing",
        actionId: "event.move",
      },
    }),
  );
}

let captureAccountEmail: string | null = null;
let captureAccountSynthetic = false;

export function updateCompassE2ECaptureIdentity(input: {
  email?: string | null;
  isSynthetic?: boolean | null;
}): void {
  captureAccountEmail = input.email?.trim() ? input.email.trim() : null;
  captureAccountSynthetic = input.isSynthetic === true;
  syncCompassE2EHelpers();
}

function shouldExposeCompassE2EHelpers(): boolean {
  if (ENV_WEB.NODE_ENV === NodeEnv.Test) return true;
  if (captureAccountSynthetic) return true;
  return Boolean(
    captureAccountEmail && isSyntheticAccountEmail(captureAccountEmail),
  );
}

function syncCompassE2EHelpers(): void {
  if (!shouldExposeCompassE2EHelpers()) {
    delete window.__compassE2E;
    return;
  }

  window.__compassE2E = {
    showAppUpdateAvailableToast,
    showRecurrenceScopeCaptureToast,
    showConferenceLinkAddedCaptureToast,
    showGuestRsvpCaptureToast,
    showNewMeetingsCaptureToast,
    showShortcutUpgradeCaptureToast,
  };
}

/** Playwright and synthetic-account capture hooks for deterministic notice shots. */
export function mountCompassE2EHelpers(): void {
  syncCompassE2EHelpers();
}
