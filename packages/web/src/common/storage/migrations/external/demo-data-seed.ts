import { DateTimeSchema, EventIdSchema } from "@core/types/domain-primitives";
import {
  type Event,
  type EventContent,
  EventScheduleSchema,
} from "@core/types/event.contracts";
import {
  type Attendee,
  type Conference,
  type Organizer,
} from "@core/types/event-attendance.contracts";
import { type EventColorSlot } from "@core/types/event-color.contracts";
import dayjs from "@core/util/date/dayjs";
import { getLocalCalendarSentinelId } from "@web/calendars/local-calendar.sentinel";
import { getBrowserTimeZone } from "@web/common/utils/datetime/web.date.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { VIEW_SHORTCUTS } from "@web/shortcuts/shortcuts.constants";
import { type OfflineDataStore } from "../../offline-data/offline-data.store";
import { type ExternalMigration } from "../migration.types";

/**
 * Creates a demo LocalEventRecord (B13/D) with sensible defaults, marked
 * `isDemo` so it's excluded from `syncLocalEventsToCloud`.
 */
function createEventRecord(overrides: {
  title: string;
  description?: string;
  schedule:
    | { kind: "timed"; start: string; end: string; timeZone: string }
    | { kind: "allDay"; start: string; end: string };
  // Read-only, provider-sourced fields on a real synced event - only
  // showcased here so first-time users (who never connect Google before
  // seeing the calendar) discover the meeting-link/location/attendees UI at
  // all, since it otherwise only ever renders for Google-synced events.
  location?: string;
  organizer?: Organizer;
  attendees?: Attendee[];
  conference?: Conference;
  /** Stable id override for events onboarding references by id. */
  id?: string;
  /** Color tag, so the seed doubles as a tour of the color system. */
  color?: EventColorSlot;
}): LocalEventRecord {
  const id = EventIdSchema.parse(overrides.id ?? createObjectIdString());
  const content: EventContent = {
    kind: "details",
    title: overrides.title,
    description: overrides.description ?? "",
    location: overrides.location,
    organizer: overrides.organizer,
    attendees: overrides.attendees,
    conference: overrides.conference,
    color: overrides.color,
  };
  const now = DateTimeSchema.parse(new Date().toISOString());

  const event: Event = {
    id,
    calendarId: getLocalCalendarSentinelId(),
    content,
    schedule: EventScheduleSchema.parse(overrides.schedule),
    recurrence: { kind: "single" },
    createdAt: now,
    updatedAt: null,
  };

  return { version: 2, id, event, isDemo: true };
}

/**
 * Stable ids for landmark demo events, kept fixed so tests (and any future
 * onboarding surface) can reference them instead of whatever random id a
 * fresh seed happens to generate.
 */
export const DEMO_EVENT_IDS = {
  /** Today, 9:00-9:30. */
  morningStandup: "demo-morning-standup",
  /** Tomorrow, 14:30-15:30 - overlaps Team sync, an obvious conflict. */
  dentist: "demo-dentist",
  /** Tomorrow, 14:00-15:00 - overlaps Dentist. */
  teamSync: "demo-team-sync",
} as const;

/**
 * Generate demo data relative to the current date.
 */
function generateDemoData() {
  const now = dayjs();
  const today = now.toYearMonthDayString();
  const timeZone = getBrowserTimeZone();

  // Helper for creating timed events on today +/- offsetDays (clone to avoid
  // mutating now). 15-minute-aligned, consistent with event creation in the app.
  const dayAt = (offsetDays: number, h: number, m = 0) =>
    now
      .clone()
      .add(offsetDays, "day")
      .hour(h)
      .minute(m)
      .second(0)
      .millisecond(0)
      .format();

  const todayAt = (h: number, m = 0) => dayAt(0, h, m);

  const timedOn = (
    offsetDays: number,
    title: string,
    startHour: number,
    startMinute: number,
    endHour: number,
    endMinute: number,
    options?: { id?: string; color?: EventColorSlot },
  ) =>
    createEventRecord({
      id: options?.id,
      color: options?.color,
      title,
      schedule: {
        kind: "timed",
        start: dayAt(offsetDays, startHour, startMinute),
        end: dayAt(offsetDays, endHour, endMinute),
        timeZone,
      },
    });

  // ─── Regular Events (Today) ─────────────────────────────────────────────────
  const todayEvents: LocalEventRecord[] = [
    createEventRecord({
      id: DEMO_EVENT_IDS.morningStandup,
      title: "Morning standup",
      description:
        "Let's be honest. No one here has actually done anything. You are just making things up as you go. And yet, all of you sit here, pretending as if we are making progress. It seems, my dear team, that the only thing we do efficiently is exceed the stand up time.",
      schedule: {
        kind: "timed",
        start: todayAt(9, 0),
        end: todayAt(9, 30),
        timeZone,
      },
      // Showcases the meeting-link and attendee UI (normally only populated
      // from a synced event) for first-time users who haven't connected a
      // calendar yet.
      conference: {
        url: "https://meet.google.com/abc-defg-hij",
        label: "Google Meet",
      },
      organizer: { email: "avery@example.com", displayName: "Avery" },
      attendees: [
        {
          email: "avery@example.com",
          displayName: "Avery",
          responseStatus: "accepted",
        },
        {
          email: "sam@example.com",
          displayName: "Sam",
          responseStatus: "accepted",
        },
        {
          email: "jordan@example.com",
          displayName: "Jordan",
          responseStatus: "tentative",
        },
        {
          email: "riley@example.com",
          displayName: "Riley",
          responseStatus: "needsAction",
        },
      ],
    }),
    createEventRecord({
      title: "Try Compass",
      description:
        "Welcome! Click any empty time slot to create an event, or press C. When you're ready to sync your calendar, use the connect button in the sidebar.",
      schedule: {
        kind: "timed",
        start: todayAt(10, 0),
        end: todayAt(11, 0),
        timeZone,
      },
    }),
    createEventRecord({
      title: "Exercise",
      description: "I'm sorry for what I said during burpees.",
      color: "green",
      // Showcases the location → Google Maps link.
      location: "Fitness First Gym, 123 Main St",
      schedule: {
        kind: "timed",
        start: todayAt(12, 0),
        end: todayAt(13, 0),
        timeZone,
      },
    }),
    createEventRecord({
      title: "Call a friend",
      description:
        "Your calendar, your data. Sign up whenever you're ready to save across browsers.",
      schedule: {
        kind: "timed",
        start: todayAt(17, 0),
        end: todayAt(18, 0),
        timeZone,
      },
    }),
    createEventRecord({
      title: "Deep work day",
      description:
        "The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable in our economy. As a consequence, the few who cultivate this skill, and then make it the core of their working life, will thrive.",
      schedule: {
        kind: "allDay",
        start: today,
        end: dayjs(today).add(1, "day").toYearMonthDayString(),
      },
    }),
    // Onboarding hints (previously seeded as tasks, now calendar events).
    createEventRecord({
      title: "Peek at your week",
      description: `Press '${VIEW_SHORTCUTS.week.key}' to switch to Week view and see the whole week at a glance. Press '?' anytime for all keyboard shortcuts.`,
      schedule: {
        kind: "timed",
        start: todayAt(14, 0),
        end: todayAt(14, 30),
        timeZone,
      },
    }),
    createEventRecord({
      title: "Create your daily plan",
      description:
        "Press C to create an event, or drag across empty slots on the grid to block time for what matters most.",
      schedule: {
        kind: "timed",
        start: todayAt(15, 0),
        end: todayAt(15, 30),
        timeZone,
      },
    }),
  ];

  // ─── Nearby days (±1, ±2) ────────────────────────────────────────────────
  // Gives arrow-focus and week navigation real targets on every nearby day.
  // Tomorrow's Team sync / Dentist overlap is the guided tour's capstone
  // mission target - titles make the conflict obvious at a glance.
  // Work stays blue, health/movement green, focus time slate; the rest keeps
  // the calendar default so the palette reads as a feature, not noise.
  const nearbyEvents: LocalEventRecord[] = [
    // Today - 2
    timedOn(-2, "Design review", 10, 0, 11, 0, { color: "blue" }),
    timedOn(-2, "1:1 with Avery", 15, 0, 15, 30, { color: "blue" }),
    // Today - 1
    timedOn(-1, "Gym", 7, 0, 7, 45, { color: "green" }),
    timedOn(-1, "Lunch with Sam", 12, 0, 13, 0),
    timedOn(-1, "Focus block", 14, 0, 16, 0, { color: "slate" }),
    // Today + 1 (tomorrow) - deliberate overlap
    timedOn(1, "Design review", 10, 0, 11, 0, { color: "blue" }),
    timedOn(1, "Team sync", 14, 0, 15, 0, {
      id: DEMO_EVENT_IDS.teamSync,
      color: "blue",
    }),
    timedOn(1, "Dentist", 14, 30, 15, 30, { id: DEMO_EVENT_IDS.dentist }),
    // Today + 2
    timedOn(2, "1:1 with Avery", 11, 0, 11, 30, { color: "blue" }),
    timedOn(2, "Focus block", 13, 0, 15, 0, { color: "slate" }),
    timedOn(2, "Gym", 17, 0, 17, 45, { color: "green" }),
  ];

  return {
    events: [...todayEvents, ...nearbyEvents],
  };
}

/**
 * Seeds demo data for first-time users.
 *
 * This migration checks if the user has any existing events.
 * If storage is empty (first-time user), it populates the app with
 * sample events so they can immediately explore functionality.
 */

const DEMO_DATA_SEED_MIGRATION_ID = "demo-data-seed-v2";

/** localStorage flag key used to track demo data seed completion. */
export const DEMO_DATA_SEED_FLAG_KEY = `compass.migration.${DEMO_DATA_SEED_MIGRATION_ID}`;

export const demoDataSeedMigration: ExternalMigration = {
  id: DEMO_DATA_SEED_MIGRATION_ID,
  description: "Seed demo data for first-time users",

  async migrate(store: OfflineDataStore): Promise<void> {
    const existingEvents = await store.getAllEvents();
    if (existingEvents.length > 0) return;

    const demoData = generateDemoData();
    await store.putEvents(demoData.events);
  },
};
